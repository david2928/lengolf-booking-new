/**
 * ShopeePay wordmark — a brand-compliant text representation in the
 * official ShopeePay orange (#EE4D2D, the Shopee primary brand color).
 *
 * We render this as styled text rather than a logo SVG/PNG to avoid
 * shipping a third-party brand asset. ShopeePay's branding guidelines
 * require either the official wordmark/logo OR an unmodified text
 * representation in the brand color; this component is the latter.
 *
 * If/when LENGOLF onboards onto a paid ShopeePay merchant tier and
 * receives the official asset bundle, swap this for the SVG logo and
 * keep the same export name.
 */
export function ShopeepayWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-bold tracking-tight text-[#EE4D2D] ${className}`}
      aria-label="ShopeePay"
    >
      ShopeePay
    </span>
  );
}
