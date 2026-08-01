'use client';

import { useTranslations } from 'next-intl';
import { ProviderButtons } from '@/components/auth/ProviderButtons';
import { saveContactDraft } from './contactDraft';

/**
 * Sign-in offered INSIDE the booking flow, as a shortcut rather than a gate.
 *
 * The framing is deliberate and the copy must not drift from it. It says
 * "speed this up", never "we'll fill this in for you", because the second is a
 * promise we cannot keep for a first-time customer: Google yields name and
 * email but no phone, and LINE and Facebook usually yield only a name. Complete
 * prefill comes from the linked CUSTOMER record, which by definition only a
 * returning customer has — and we cannot tell which they are until after they
 * have already tapped.
 *
 * So the honest deal is: sign in and we fill what we know, then focus the first
 * field still empty. A returning customer gets all three and it feels like
 * magic; a first-timer gets one or two and it still beat typing them.
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
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      {/* Title and body sit on one line from `sm:` up. Stacked, they cost two
          rows above a control that is itself only one row on desktop, which is
          what made this block read as heavier than the fields it introduces. */}
      <div className="mb-3 sm:flex sm:items-baseline sm:gap-2">
        <p className="text-sm font-medium text-gray-900 shrink-0">{t('signInPromptTitle')}</p>
        <p className="mt-1 text-xs text-gray-500 sm:mt-0">{t('signInPromptBody')}</p>
      </div>

      <ProviderButtons
        callbackUrl={callbackUrl}
        layout="compact"
        // OAuth is a FULL-DOCUMENT navigation. Without this the very button we
        // just added would destroy whatever the customer had already typed.
        // Written synchronously in the click handler — anything async races the
        // redirect and will not reliably land.
        onBeforeSignIn={() => saveContactDraft({ name, email, phoneNumber })}
        // Provider detection runs in an effect, so the first paint shows all
        // three and then settles. Reserving the height stops that settle
        // shifting the contact fields under a thumb mid-tap.
        //
        // Two values because the layout is two layouts: three stacked rows
        // below `sm:`, one row of three above it. Reserving the mobile height
        // on desktop would leave ~6rem of dead space under the buttons.
        minHeightClass="min-h-[8.75rem] sm:min-h-[2.75rem]"
      />

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-[11px] uppercase tracking-wider text-gray-400">
            {t('signInPromptDivider')}
          </span>
        </div>
      </div>
    </div>
  );
}
