import Script from 'next/script';

/**
 * The GTM container (GTM-MKCHVJKW), shared by every surface that needs a tag to
 * fire.
 *
 * This used to be inlined in `app/[locale]/layout.tsx`, whose comment scoped it
 * there "so LIFF and /auth/error don't pull analytics unnecessarily". That was a
 * reasonable default and it turned out to be expensive: `/liff/*` is where most
 * of our self-service bookings happen — 115 of the 206 API-created bookings in
 * the 30 days to 2026-08-08 came from a LINE-authenticated profile — and every
 * one of them was invisible to GA4. `pushBookingConfirmed()` has been called
 * from the LIFF flow since PR #136, writing to a `window.dataLayer` array that
 * no container ever read.
 *
 * Extracted rather than copy-pasted because the two call sites must not drift:
 * a second inline copy with, say, a different linker config would be a silently
 * divergent measurement surface, which is the same class of bug as the
 * English-only Click Text trigger this event was created to replace.
 *
 * `/auth/error` deliberately stays without it. It renders outside `[locale]`
 * precisely so it can't take an i18n dependency while reporting an auth
 * failure, and it has nothing to measure.
 *
 * SCOPE WARNING: mounting this on a surface opts that surface into EVERY
 * All-Pages tag in the container — GA4 config (#22), the Meta Pixel base (#48),
 * the Google Tag for AW-16456389020 (#90) and the Conversion Linker (#21) — not
 * just the booking conversion. Before adding a third surface, check the
 * container's pageview triggers for path filters that would match it; #102
 * ("Golf Page View") matches any path CONTAINING `/golf` and fires a Google Ads
 * conversion, which no `/liff/*` route hits today but a future one easily could.
 *
 * PDPA note: this fires with no consent gate and no Consent Mode, on LIFF as on
 * the web app. That gap predates this component and is tracked separately; it is
 * not made better by pretending the LINE surface is exempt.
 */

/** Container public id. Also referenced by the `<noscript>` fallback below. */
const GTM_ID = 'GTM-MKCHVJKW';

/** Google Ads account configured alongside the container. */
const GOOGLE_ADS_ID = 'AW-16456389020';

export default function GoogleTagManager() {
  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`
          window.ttq = window.ttq || {
            track: function() {},
            page: function() {},
            batch: function() {}
          };

          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${GTM_ID}');

          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
          gtag('config', '${GTM_ID}', {
            linker: { domains: ['len.golf'], decorate_forms: false }
          });
        `}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  );
}
