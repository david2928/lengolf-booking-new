# Slice 8: Split BookingDetails and add the desktop rail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `BookingDetails.tsx` (1979 lines) into focused files, then present it as three sub-steps on mobile and a two-column layout with a sticky summary rail on desktop, with contact details folded to a read-only identity card.

**Architecture:** Six stages, each its own commit. Stages A to C are **pure moves**: no behaviour changes, verified by "renders identically". Stages D to F introduce behaviour. The ordering exists because a 1979-line file cannot be safely restructured and re-behaved at once — if something breaks after stage D, stages A to C are known-good and the search space is small.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, next-intl v3, Jest + jsdom + Testing Library.

**Branch:** work on `feat/slice-8-split-details`, PR into `feat/booking-ux-overhaul` (NOT `main`).

---

## Why this order

The temptation is to write the new sub-step components and move code into them in one pass. Do not. Three things make that dangerous here:

1. **`handleSubmit` is 170 lines** (`596-767`) and closes over ~20 state variables. Any move that also reshapes it risks a silent payload change, and the payload creates real bookings and fires staff LINE notifications.
2. **12 effects** run before it, several with subtle ordering dependencies (VIP prefill races the phone-aware new-customer check; there is a comment at line 214 explaining why one fetch is deliberately NOT used).
3. **The marketing-consent checkbox** (`1471-1510`) is a compliance artifact from PR #18. It sits inside the form after the old submit block and is easy to lose in a restructure. One implementer already nearly clobbered it.

So: move dead weight out first (stage A), then extract logic without touching UI (stage B), then move UI without changing logic (stage C). Only then change what the customer sees.

---

## File Structure

Target layout under `app/[locale]/(features)/bookings/components/booking/steps/`:

```
BookingDetails.tsx                 (orchestrator: routing + layout choice, ~200 lines)
details/
  useBookingDetailsForm.ts         (all state, effects, derived values, submit)
  SessionStep.tsx                  (package fork, duration, people, bay type)
  ExtrasStep.tsx                   (club rental, gear-up add-ons)
  YourDetailsStep.tsx              (identity card / contact, notes, cost, consent)
  SummaryRail.tsx                  (desktop right column)
  IdentityCard.tsx                 (read-only contact summary + Change)
  modals/
    PackageDetailsModal.tsx
    ClubRentalDetailsModal.tsx     (includes the Paradym carousel)
    NoAvailabilityModal.tsx
    SubmitOverlay.tsx
```

Each sub-step receives what it needs as explicit props from the hook's return value. No sub-step reaches into the hook itself, so each is testable in isolation with a plain props object.

---

## Stage A: Extract the modals

Removes ~470 lines with zero logic change. Highest ratio of benefit to risk in the whole slice.

### Task A1: Extract the four modals

**Files:**
- Create: `steps/details/modals/PackageDetailsModal.tsx` (from lines 1549-1682)
- Create: `steps/details/modals/ClubRentalDetailsModal.tsx` (from lines 1683-1972, includes the Paradym carousel at 1891-1971)
- Create: `steps/details/modals/NoAvailabilityModal.tsx` (from lines 1511-1538)
- Create: `steps/details/modals/SubmitOverlay.tsx` (from lines 1539-1548)
- Modify: `steps/BookingDetails.tsx`

- [ ] **Step 1: Read the source ranges first**

Read `BookingDetails.tsx` lines 1511-1979 in full before writing anything. For each modal, write down: which state variables it reads, which setters it calls, which `t()` keys it uses, and which imports it needs. You will pass all of those in as props.

- [ ] **Step 2: Move each modal verbatim**

For each of the four, create the file with a `'use client'` directive, a props interface listing exactly what you catalogued, and the JSX **moved verbatim** from the source range. Change only what must change: `useState` reads become props, setter calls become callback props, and `t` becomes a prop (`t: (key: string, values?: Record<string, unknown>) => string`) OR the component calls `useTranslations('bookings.detailsStep')` itself. Prefer the latter — it keeps the prop surface small and the namespace is the same.

**Do not** reformat, rename variables, reorder JSX, "simplify" conditionals, or fix anything you notice. This is a move. Anything you spot goes in your report, not in the diff.

The `ClubRentalDetailsModal` owns `paradymCarouselIndex` state (line 517) entirely — no other section reads it. Move that `useState` into the modal rather than threading it through props.

- [ ] **Step 3: Wire them up**

Replace each source range in `BookingDetails.tsx` with the corresponding `<XModal ... />`. Delete now-unused imports from `BookingDetails.tsx` (lint will tell you which).

- [ ] **Step 4: Verify it is genuinely a no-op**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass, build shows 0 `MISSING_MESSAGE`.

Then confirm the line count dropped by roughly 450:
```bash
wc -l "app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx"
```
Expected: ~1520, down from 1979.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(features)/bookings/components/booking/steps/details/modals/" "app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx"
git commit -m "refactor(bookings): extract booking-details modals into own files"
```

---

## Stage B: Extract state and effects into a hook

No UI change at all. The JSX stays byte-identical; only where its values come from changes.

### Task B1: Create `useBookingDetailsForm`

**Files:**
- Create: `steps/details/useBookingDetailsForm.ts`
- Modify: `steps/BookingDetails.tsx`

- [ ] **Step 1: Catalogue before moving**

List every `useState` (lines 165-206, 495, 515-517 minus the carousel you already moved), every `useEffect` (209, 257, 290, 296, 319, 408, 441, 456, 464, 520, 525), `getBayAvailabilityForDuration` (280), the `costBreakdown` IIFE (498), `validateForm` (551), `ensureMinimumAnimationDuration` (589), `handleSubmit` (596), `formatDate` (767), `firstInvalidField` (784), `handlePrimaryCta` (794).

- [ ] **Step 2: Move them verbatim into the hook**

The hook takes the same props `BookingDetails` receives (`selectedDate`, `selectedTime`, `selectedBayType`, `maxDuration`, `slotData`, `onBack`, `selectedPackage`, `fixedPeople`, `isPackageMode`, `selectedClubRental`, `onClubRentalChange`, `selectedClubSetId`, `onClubSetIdChange`, `selectedAddOns`, `onAddOnsChange`) and returns an object with everything the JSX currently reads.

**Preserve effect declaration order exactly.** Several effects depend on running before or after others — line 214 has a comment explaining why one fetch is deliberately avoided to prevent a race that re-introduced a "bait-and-switch" bug. Reordering them can silently reintroduce it.

`handleSubmit` moves **verbatim**. Do not refactor it, do not extract helpers from it, do not change the request payload. It creates real bookings and triggers staff notifications.

- [ ] **Step 3: Consume it**

`BookingDetails.tsx` becomes `const f = useBookingDetailsForm(props);` followed by the existing JSX with reads rewritten to `f.duration`, `f.name`, and so on. Destructure at the top if that reads better, but do not rename anything.

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass, 0 `MISSING_MESSAGE`.

**Then diff the rendered output.** Start the dev server, reach step 3 (you will need an authenticated session — ask the controller, do not create an account), and confirm: the cost breakdown shows the same total for the same inputs, the duration grid renders the same options, and the sticky bar total matches. Report what you compared.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(bookings): move booking-details state and effects into a hook"
```

---

## Stage C: Extract the three section components

Still no behaviour change. All three render one after another exactly as now.

### Task C1: SessionStep, ExtrasStep, YourDetailsStep

**Files:**
- Create: `steps/details/SessionStep.tsx` (package selection, duration, people)
- Create: `steps/details/ExtrasStep.tsx` (club rental, gear up)
- Create: `steps/details/YourDetailsStep.tsx` (contact, notes, cost breakdown, Back button, marketing consent)
- Modify: `steps/BookingDetails.tsx`

> **Corrected during execution.** This stage originally assigned the "Selected Info
> Cards" block (which holds `id="bd-bay"`) and the AI-Lab group-size warning to
> `SessionStep`. That is impossible while keeping the stage a pure move: those two
> blocks render **outside** the `<form>`, whereas package/duration/people render
> inside it. Moving them in insets them by the form's `p-3 sm:p-6` and wraps them
> in its `rounded-xl shadow-sm`, which is a visible change.
>
> Resolution: `SessionStep` owns only the three in-form blocks. The info cards and
> the AI-Lab warning stay in `BookingDetails.tsx` above the `<form>`, with a comment
> marking them as conceptually part of the Session sub-step. **Stage D moves them
> in**, where a visible layout change is expected by design.
>
> A third option was considered and rejected: `SessionStep` owning the `<form>` and
> taking `children`. That is DOM-identical, but it cannot work in stage D, where
> `SessionStep` must be a single gated screen rather than the wrapper of the other
> two sub-steps.

- [ ] **Step 1: Move verbatim, props in, no logic**

Each component takes an explicit props interface. No component receives the whole hook return; list the fields it actually uses. Each calls `useTranslations('bookings.detailsStep')` itself.

**Carry these across intact:**
- The `bd-name`, `bd-phone`, `bd-email` anchor ids and `scroll-mt-24` classes, and the amber flagged-state branches. `firstInvalidField` finds fields by `document.getElementById`, so the ids must survive.
- `id="bd-bay"` on the bay-type card.
- The marketing-consent checkbox and `consentNote` paragraph (1471-1510), into `YourDetailsStep`. Do not drop them.
- `ProjectedCostBreakdown` stays in `YourDetailsStep`.

- [ ] **Step 2: Render all three in sequence**

In `BookingDetails.tsx`, inside the existing `<form>`, render `<SessionStep …/><ExtrasStep …/><YourDetailsStep …/>` in that order. The visible result must be identical to before.

- [ ] **Step 3: Verify**

Run the four gates. Then in a browser at step 3, confirm every section still appears in the same order, jump-to-error still scrolls to and focuses the name field, and the flagged field shows an amber border **and** an amber background (`rgb(255, 251, 235)`). That last one regressed once already because `bg-gray-50` was emitted unconditionally alongside `bg-amber-50`.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(bookings): split booking details into three section components"
```

---

## Stage D: Mobile sub-steps

First behaviour change. The three sections become three screens.

### Task D1: Sub-step navigation

**Files:**
- Create: `steps/details/useDetailsSubStep.ts`
- Modify: `steps/BookingDetails.tsx`
- Modify: `messages/{en,th,ja,ko,zh}.json`

- [ ] **Step 1: The sub-step hook**

```typescript
export const DETAIL_SUB_STEPS = ['session', 'extras', 'contact'] as const;
export type DetailSubStep = (typeof DETAIL_SUB_STEPS)[number];
```

Expose `subStep`, `subStepIndex`, `goToSubStep`, `nextSubStep`, `prevSubStep`, and `isLast`. Keep it in component state; do NOT put it in the URL. The top-level wizard step already lives in `useBookingFlow` and adding a second source of navigation truth invites the two to disagree.

- [ ] **Step 2: Move the info cards into SessionStep**

Stage C deliberately left the "Selected Info Cards" block (holding `id="bd-bay"`) and the AI-Lab group-size warning in `BookingDetails.tsx`, outside the `<form>`, to keep that stage a pure move. Move them into `SessionStep` now. This inches those cards inward by the form's padding and wraps them in its shadow, which is fine here because this stage changes the layout intentionally.

`firstInvalidField` finds `bd-bay` with `document.getElementById`, so verify it still resolves after the move. It is a runtime lookup with no type safety.

- [ ] **Step 3: Render one sub-step at a time on mobile**

Render only the active sub-step below `lg:`. Above `lg:` render all three (stage E replaces that with the two-column layout).

Completed sub-steps collapse to a one-line summary with a Change button, matching the mockup: `Session · 1.5 h · Social Bay · 2 people`.

**Navigation design, owner-confirmed 2026-07-25.** Three affordances, each with exactly one meaning, and no meaning served by two controls:

| Control | Meaning |
|---|---|
| Header arrow (`page.tsx:68`) | Backward one level: back a sub-step if there is one, else exit step 3 to time selection |
| "Change" on a collapsed summary | Jump directly to that named sub-step |
| Sticky bar CTA | Forward only: Continue, then Confirm on the last sub-step |

**Delete the in-form Back button** (currently `YourDetailsStep.tsx:213`). It is not a second capability: it calls the same `handleBack` as the header arrow, so today they are exact duplicates and the in-form one is merely worse placed. Removing it removes redundancy.

Making the header arrow context-aware requires `page.tsx` to know the sub-step. Lift the sub-step state to `useBookingFlow`, or pass a callback up from `BookingDetails`. Prefer whichever keeps a single source of navigation truth; say which you chose and why.

Two options were considered and rejected:
- **Back in the sticky bar.** On a 375px viewport the CTA already spans x 175→359; a 44px back target would squeeze either the total or the label, and it parks a secondary action beside the primary one, where a misclick costs the customer their place in a filled-in form.
- **Keep both controls, differentiate them.** Gets the priorities backwards: the more common action (back one sub-step) would sit at the bottom of a scroll while the rarer one (leave step 3) keeps the prominent spot.

**Known and deliberately out of scope:** sub-steps live in component state, not the URL, so browser back and Android gesture-back exit the flow rather than stepping back a sub-step. The top-level wizard already behaves this way — Date, Time and Details share one URL — so this is not a regression. URL-backing sub-steps would add a second source of navigation truth alongside `useBookingFlow` and would interact with the `useFlowPersistence` restore; it deserves its own piece of work.

- [ ] **Step 4: Retarget the sticky bar CTA**

The bar's CTA currently always submits. It must now advance while `!isLast` and submit only on the last sub-step. Extend `firstInvalidField` to validate **only the fields on the current sub-step**, so tapping Continue on Session does not complain about a blank email three screens away:

```typescript
const firstInvalidFieldForSubStep = (s: DetailSubStep): string | null => {
  if (s === 'contact') {
    if (!name.trim()) return 'bd-name';
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) return 'bd-phone';
    if (!email.trim()) return 'bd-email';
  }
  return null;
};
```

Session and Extras have no required fields today: duration defaults to 1, people defaults to 1, bay defaults to `'social'`, and club rental defaults to `'standard'`. Note in your report that this means Continue never blocks on those two sub-steps, so nobody later assumes it does.

- [ ] **Step 5: i18n**

Add to `bookings.detailsStep` in all five locales: `subStepSession`, `subStepExtras`, `subStepContact`, `subStepProgress` (ICU, e.g. `"Details · {current} of {total}"`), `changeAction`, `ctaContinue`.

**Do NOT reserialise the catalogs.** They are CRLF and a `JSON.stringify` round-trip rewrites every line and still does not match byte-for-byte. Insert the new lines textually, anchored on an existing unique key, and verify with `git diff --stat` that only the lines you added changed.

- [ ] **Step 6: Verify**

Four gates, then in a browser: walk Session → Extras → Your details, confirm the bar CTA label changes and only submits on the last sub-step, confirm Change returns you to a completed sub-step with its values intact, and confirm the marketing-consent checkbox is still present and reachable on the last sub-step.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(bookings): split booking details into three mobile sub-steps"
```

---

## Stage E: Desktop two-column with sticky rail

### Task E1: SummaryRail and the desktop layout

**Files:**
- Create: `steps/details/SummaryRail.tsx`
- Modify: `steps/BookingDetails.tsx`

- [ ] **Step 1: The rail**

Renders the line items from `costBreakdown` (including the prorated bay-rate segments, which is the number customers query most), the total, and the Confirm button. It reuses `handlePrimaryCta` — do not duplicate validation.

Props: `costBreakdown: CostBreakdown | null`, `selectedDate`, `selectedTime`, `duration`, `numberOfPeople`, `bayLabel`, `ctaLabel`, `onCta`, `ctaLoading`.

- [ ] **Step 2: Two columns above `lg:`**

`grid lg:grid-cols-[1fr_296px] gap-6 items-start`, form left, `<SummaryRail>` right with `lg:sticky lg:top-6`. On desktop all three sections render in the left column with no sub-step gating — there is room, and gating would be artificial.

- [ ] **Step 3: Hide the mobile bar on desktop**

Two totals on one screen is worse than either alone. Render `BookingSummaryBar` only below `lg:`.

**Careful:** the bar owns the `has-summary-bar` body class that lifts the chat FAB and pads the document. If the bar does not render on desktop, neither happens — which is correct, since there is no bar to collide with. Verify the FAB is not left floating over the rail's Confirm button on a desktop viewport, and that the document has no leftover bottom padding.

- [ ] **Step 4: Verify at three widths**

375px (mobile: sub-steps, bar, no rail), 1024px, 1440px (desktop: two columns, rail, no bar). At each: no horizontal scroll, Confirm reachable, no element overlapping another. Report measured rects, not impressions.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bookings): two-column booking details with a sticky summary rail on desktop"
```

---

## Stage F: Contact identity card

Owner-confirmed 2026-07-25: **edits apply to this booking only by default**, with an opt-in to update the saved account. This changes today's behaviour, where submit silently overwrites `profiles`.

### Task F1: IdentityCard and scoped edits

**Files:**
- Create: `steps/details/IdentityCard.tsx`
- Modify: `steps/details/YourDetailsStep.tsx`, `steps/details/useBookingDetailsForm.ts`
- Modify: `messages/{en,th,ja,ko,zh}.json`

- [ ] **Step 1: The card**

Shows initials, name, phone and email with a Change button. Renders **only when all three of name, phone and email are present and the phone is valid** — partial prefill is common for LINE users with no email on file, and a card showing a blank email is worse than the plain fields. Otherwise render the existing three inputs.

- [ ] **Step 2: Change reveals the fields**

Add `isEditingContact` state. Change sets it true and reveals the existing inputs, with a checkbox: `alsoUpdateAccount`, default **unchecked**.

- [ ] **Step 3: Scope the write-back**

Find `profileNeedsUpdate` in `handleSubmit` (currently around line 640-660, in the hook after stage B). Today it writes to `profiles` whenever the values differ from the loaded profile. Gate that write on `alsoUpdateAccount`:

```typescript
const shouldUpdateProfile = alsoUpdateAccount && profileNeedsUpdate;
```

Leave the booking payload untouched: the booking still records whatever name, phone and email were entered. Only the **profile write** is gated.

- [ ] **Step 5: i18n**

`bookings.detailsStep`: `bookingAsLabel`, `changeContact`, `alsoUpdateAccount`, `alsoUpdateAccountHint`. Same textual-insertion rule as stage D.

- [ ] **Step 5: Verify the write-back is actually gated**

This is the one that matters. In a browser with a session:
1. Reach Your details, confirm the identity card shows rather than three inputs.
2. Change, edit the name, leave the checkbox unchecked, submit.
3. Confirm the booking recorded the new name AND the `profiles` row did **not** change. Ask the controller to run the query; do not query production yourself.
4. Repeat with the checkbox ticked, confirm the profile row does change.

If you cannot get a session, STOP and report rather than assuming.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(bookings): contact identity card with this-booking-only edits by default"
```

---

## Out of Scope

- Half-hour duration ladder in the UI (slice 3, separate PR — the v3 SQL function is already applied)
- Food set cards (slice 6)
- Package hours / States A and B (slice 7)
- Offer selection and the weekday B1G1 (slices 4 and 5)
- Time-step tabs and the free-hours balance (slice 9)
- Any change to `handleSubmit`'s request payload
- Any change to pricing or `lib/cost-calculator.ts`

## Definition of Done

- [ ] `BookingDetails.tsx` under 250 lines; no new file over 400
- [ ] `npm test`, `typecheck`, `lint`, `build` all pass; 0 `MISSING_MESSAGE`
- [ ] Mobile: three sub-steps, bar CTA advances then submits, Change preserves values
- [ ] Desktop: two columns, sticky rail, no mobile bar, no FAB collision with the rail
- [ ] Verified at 375 / 1024 / 1440 with measured rects
- [ ] Marketing-consent checkbox present and reachable
- [ ] Jump-to-error still scrolls, focuses, and shows amber border **and** background
- [ ] Contact edits do not touch `profiles` unless the opt-in is ticked
- [ ] `handleSubmit` payload byte-identical to before this slice
