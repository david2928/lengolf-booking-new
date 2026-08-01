'use client';

import { useTranslations } from 'next-intl';
import { ProviderButtons } from '@/components/auth/ProviderButtons';
import { saveContactDraft } from './contactDraft';

/**
 * Sign-in offered INSIDE the booking flow, as a shortcut rather than a gate.
 *
 * ── The copy ──────────────────────────────────────────────────────────────
 * The framing is deliberate and must not drift. It says "speed this up", never
 * "we'll fill this in for you", because the second is a promise we cannot keep
 * for a first-time customer: Google yields name and email but no phone, and
 * LINE and Facebook usually yield only a name. Complete prefill comes from the
 * linked CUSTOMER record, which by definition only a returning customer has,
 * and we cannot tell which they are until after they have already tapped.
 *
 * ── The visual weight ─────────────────────────────────────────────────────
 * This block is OPTIONAL and sits above three REQUIRED fields, so it must not
 * outweigh them. The first version did, and the reason is worth recording
 * because it is easy to reintroduce:
 *
 *  - it was a bordered card, which framed it as a section of its own rather
 *    than an affordance belonging to the fields below;
 *  - its three buttons were brand-FILLED, putting Facebook blue and LINE green
 *    into a step whose only accent should be the green Confirm button;
 *  - stacked full-width on a ~1,100px column, it stood roughly as tall as the
 *    entire contact form it was introducing.
 *
 * The fix is not smaller padding. It is recognising what these controls ARE: an
 * input method for the name, email and phone directly beneath them. So they are
 * styled as siblings of those inputs — same radius, same border, same height
 * family — laid out in one row from `sm:` up, with colour surviving only in the
 * brand marks. The card is gone; a single hairline rule separates the shortcut
 * from the manual path, which is all the separation it ever needed.
 */
interface InFlowSignInProps {
  name: string;
  email: string;
  phoneNumber: string | undefined;
  /**
   * Where to come back to, already locale-prefixed and query-free. Built by
   * `useBookingDetailsForm` via `localePath`, not here: a leaf component that
   * reaches for routing context (`useLocale`) cannot be rendered in isolation,
   * and takes its parent's tests down with it.
   */
  callbackUrl: string;
}

export function InFlowSignIn({ name, email, phoneNumber, callbackUrl }: InFlowSignInProps) {
  const t = useTranslations('bookings.detailsStep');

  return (
    <div className="mb-5">
      {/* Label and buttons share a row from `sm:` up. The label is set at the
          same size and weight as the form's own field labels, so it reads as
          part of the form rather than as a banner above it. */}
      <div className="sm:flex sm:items-center sm:gap-4">
        <div className="mb-2 shrink-0 sm:mb-0">
          <p className="text-sm font-medium text-gray-700">{t('signInPromptTitle')}</p>
          <p className="text-xs text-gray-400">{t('signInPromptBody')}</p>
        </div>

        <div className="flex-1">
          <ProviderButtons
            callbackUrl={callbackUrl}
            layout="compact"
            // OAuth is a FULL-DOCUMENT navigation. Without this the very button
            // we just added would destroy whatever the customer had already
            // typed. Written synchronously in the click handler — anything
            // async races the redirect and will not reliably land.
            onBeforeSignIn={() => saveContactDraft({ name, email, phoneNumber })}
            // Provider detection runs in an effect, so the first paint shows all
            // three and then settles. Reserving the height stops that settle
            // shifting the contact fields under a thumb mid-tap. Two values
            // because it is two layouts: three stacked rows below `sm:`, one row
            // of three above it.
            minHeightClass="min-h-[8.75rem] sm:min-h-[2.75rem]"
          />
        </div>
      </div>

      {/* A hairline, not a labelled divider. With the card gone the fields below
          follow naturally, and "or enter them yourself" was narrating a
          transition the layout already makes obvious. */}
      <div className="mt-5 border-t border-gray-100" />
    </div>
  );
}
