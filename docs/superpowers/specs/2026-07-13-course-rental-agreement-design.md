# Course Club Rental Agreement — Design & Draft

**Date:** 2026-07-13
**Status:** Draft, pending user review
**Author:** Session brainstorm (David + Claude)

> **Not legal advice.** This is a practical, plain-language draft written from how the
> rental actually operates. A Thai lawyer should review sections 6 and 10 (damage
> liability and limitation of liability) against Thai consumer-protection law before
> LENGOLF relies on this text.

---

## 1. Purpose

A single, canonical golf **course** (off-site) club rental agreement that applies to
every renter who takes club sets off-site to a golf course. Published as a public page
and referenced from the booking flow.

Indoor / in-store simulator club rentals are **out of scope** (they stay on-premise,
negligible liability).

## 2. Decisions (locked)

| Decision | Value |
|---|---|
| Scope | Course (off-site) rental only |
| Canonical home | `lengolf-website` → `/[locale]/golf-course-club-rental-agreement` |
| Booking-side | `booking-new` course-rental footer links to the canonical URL (no duplicate copy) |
| Acceptance model | Standalone published page; acceptance is by completing a booking (no checkout checkbox) |
| Language | English authoritative; translations for convenience; English governs |
| Payment hold | Held up to 2 hours while paying, auto-cancelled if unpaid |
| Wear & tear | Covered by LENGOLF — renter not charged for normal wear |
| Loss / serious damage | Renter pays repair cost, or fair replacement value if unrepairable; assessed case-by-case |
| Delivery area | Bangkok and surrounding areas, by arrangement |

## 3. Architecture

- **Canonical page (lengolf-website):** new server component at
  `app/[locale]/golf-course-club-rental-agreement/page.tsx`, mirroring the existing
  `app/[locale]/terms-of-service/page.tsx` pattern:
  - `SectionWrapper` + Tailwind `prose` container
  - `setRequestLocale(locale)`
  - `metadata` with title, description, `alternates.canonical`
  - breadcrumb JSON-LD via `getBreadcrumbJsonLd`
  - English content (consistent with current terms-of-service / privacy-policy pages)
  - add the route to `app/sitemap.ts`
  - optional: link it from the site footer legal links + from the
    `golf-course-club-rental` marketing page
- **Booking flow (booking-new):** add a footer/fine-print link to
  `https://www.len.golf/golf-course-club-rental-agreement/` on the course-rental
  page/steps, near the payment info.
- **Single source of truth:** only the website hosts the text; booking-new links out.

## 4. Full agreement draft (English, authoritative)

> **LENGOLF Golf Course Club Rental Agreement**
> Last updated: 13 July 2026

This Agreement governs the rental of golf club sets and related equipment (the
"Equipment") by LENGOLF ("we", "us", "LENGOLF") to you ("you", the "Renter") for
off-site use at golf courses. It applies to every off-site (course) rental you make with
us, whether booked at booking.len.golf, by LINE, phone, email, or in person. Indoor /
in-store simulator club rentals are not covered by this Agreement.

By confirming a course rental booking with us, you agree to this Agreement.

**1. The Rental**
- We rent you the club set(s) and any add-on items shown in your booking confirmation,
  for the rental period stated there (from the start date/time to the return date/time).
- The Equipment remains the property of LENGOLF at all times.
- You may collect the Equipment from LENGOLF (The Mercury Ville @ BTS Chidlom) or request
  delivery (see section 7).

**2. Fees and Payment**
- Rental fees, delivery fees, and add-on prices are those shown at booking. Payment is
  made online at booking time via ShopeePay (card or ShopeePay wallet). Delivery orders
  require online prepayment; pickup orders may alternatively pay cash on collection.
- No security deposit is required.
- Your reservation is held for up to 2 hours while you complete payment. If payment is not
  completed within that time, the reservation is automatically cancelled and the Equipment
  released.

**3. Condition at Handover**
- Please inspect the Equipment when you collect or receive it. If anything is missing,
  damaged, or not as expected, tell us before you use it (LINE @lengolf, 096-668-2335, or
  info@len.golf).
- If you do not report an issue before use, the Equipment is treated as received complete
  and in good condition.

**4. Your Responsibilities**
- Use the Equipment only for playing golf, in the normal way, and keep it in your
  possession and control during the rental period.
- Take reasonable care of the Equipment and protect it from loss, theft, and avoidable
  damage.
- Do not sell, sub-rent, lend, or give the Equipment to anyone else.
- Return the complete set — including the bag and every club and add-on item — by the
  agreed return time.

**5. Normal Wear and Tear**
- Normal wear and tear from ordinary golf use — such as minor scuffs, grip wear, and
  surface marks — is expected and is covered by LENGOLF. You will not be charged for it.

**6. Loss, Theft, or Damage**
- You are responsible for loss, theft, or damage to the Equipment beyond normal wear and
  tear (section 5) that occurs while it is in your care.
- Where Equipment is damaged, you agree to pay the reasonable cost of repair. Where an
  item is lost, stolen, or damaged beyond economical repair, you agree to pay its fair
  replacement value. We assess repair cost and fair replacement value case by case and
  will explain any charge to you before applying it.
- Please tell us as soon as possible if any Equipment is lost, stolen, or damaged.

**7. Delivery and Pickup**
- We deliver within Bangkok and surrounding areas by arrangement. Delivery and
  return-pickup times and locations are agreed at booking. Locations beyond Greater
  Bangkok are handled case by case — please contact us.
- Someone must be available at the agreed location and time to receive the Equipment at
  delivery and to hand it back at return pickup.
- If we cannot complete delivery or pickup because no one is available or the details were
  incorrect, additional charges or delays may apply.

**8. Late Return**
- The Equipment is due back at the agreed return date and time. If you keep it longer,
  additional rental is charged at the standard daily rate for each additional day (or
  part-day) until it is returned.
- If the Equipment is not returned and we cannot reach you, we may treat it as lost under
  section 6.

**9. Cancellation and Refunds**
- You can cancel before collection or delivery by contacting us. Refunds of amounts
  already paid are processed back to your original payment method via ShopeePay.
- If you do not collect, or are not available to receive the Equipment (no-show), the
  booking may be treated as cancelled; refunds are handled case by case.

**10. Use at Your Own Risk; Limitation of Liability**
- Golf involves physical activity and inherent risk. You use the Equipment at your own
  risk and are responsible for using it safely and appropriately for your ability.
- The Equipment is provided on an "as is" basis for recreational golf. To the extent
  permitted by law, LENGOLF is not liable for any injury, loss, or damage arising from
  your use of the Equipment, or for any indirect or consequential loss.
- Nothing in this Agreement limits any rights you have that cannot be excluded under Thai
  law.

**11. Personal Data**
- We handle the personal details you provide to fulfil your rental in line with our
  Privacy Policy (len.golf/privacy-policy).

**12. Governing Law and Language**
- This Agreement is governed by the laws of Thailand, and any dispute is subject to the
  jurisdiction of the Thai courts.
- This Agreement is written in English. Any translation is provided for convenience only;
  if there is any conflict, the English version prevails.

**13. Contact**
- LINE: @lengolf · Phone: 096-668-2335 · Email: info@len.golf
- LENGOLF, The Mercury Ville @ BTS Chidlom, Floor 4, 540 Ploenchit Road, Lumpini,
  Pathumwan, Bangkok 10330.

**14. Acceptance**
- By confirming a course rental booking with LENGOLF — online, by LINE, phone, email, or
  in person — you confirm that you have read, understood, and agree to this Agreement.

We may update this Agreement from time to time; the version in effect when you book
applies to that rental.

## 5. Open items to confirm with David

- **Registered legal entity name.** The draft uses the trading name "LENGOLF". If the
  operating company has a registered Thai entity name (Co., Ltd.), it should appear in the
  intro and section 13. Confirm or leave as "LENGOLF".
- **Late-return grace period.** Draft charges from the agreed return time with no grace.
  Confirm whether a grace window (e.g. 1 hour) should be stated.
- **Lawyer review** of sections 6 and 10 before go-live.

## 6. Implementation tasks (for writing-plans)

1. **lengolf-website:** create `app/[locale]/golf-course-club-rental-agreement/page.tsx`
   from the terms-of-service template with the section-4 content; add to `sitemap.ts`;
   add footer/marketing-page links; verify build + page render.
2. **booking-new:** add the agreement link to the course-rental footer/fine-print near
   payment info.
3. Verify both in a dev server + page load.
