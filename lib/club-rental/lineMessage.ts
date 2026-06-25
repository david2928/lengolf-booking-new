/**
 * Unified LINE notification format for club-rental lifecycle events.
 *
 * Pure module — no env deps, no DB access. Tests live in
 * __tests__/club-rental-line-message.test.ts. Visual style mirrors the
 * existing bay-booking cancellation format in app/api/notifications/line/route.ts
 * (shouty CAPS header bracketed by status emojis, dashed separators,
 * emoji-prefixed fields, footer action line) so staff see one
 * coherent visual language across both flows.
 *
 * Same skeleton for every lifecycle event — only the title/emoji,
 * money line, optional reference line, and footer change. State-specific
 * bits live in the RentalStatus discriminated union.
 */

const SEPARATOR = '----------------------------------';

// ---------------------------------------------------------------------
// State machine — one variant per lifecycle event
// ---------------------------------------------------------------------

export type RentalStatus =
  | { kind: 'Created'; paymentMode: 'online' | 'manual' }
  | { kind: 'Paid'; transactionSn?: string | null; gatewayLabel?: string }
  | { kind: 'PaymentFailed'; reason?: string | null }
  | { kind: 'Refunded'; refundedSatang: number; refundSn?: string | null }
  | {
      kind: 'PartiallyRefunded';
      refundedThisTimeSatang: number;
      totalRefundedSatang: number;
      refundSn?: string | null;
    }
  | { kind: 'Expired' };

// ---------------------------------------------------------------------
// Inputs — everything the composer needs as plain data
// ---------------------------------------------------------------------

export interface RentalLineInput {
  rental: {
    rental_code: string;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    start_date: string; // 'YYYY-MM-DD'
    end_date: string;
    duration_days: number | null;
    delivery_requested: boolean | null;
    delivery_address: string | null;
    delivery_time: string | null;
    return_time: string | null;
    total_price: number | string;
    notes: string | null;
    add_ons?: unknown;
    /** Customer's payment choice at booking time. Surfaced to staff as a dedicated line. */
    payment_method_chosen?: string | null;
    /** Customer's preferred contact channel. Surfaced to staff as a dedicated line. */
    contact_preference?: string | null;
  };
  clubSet?: {
    name: string;
    tier: string;
    gender: string;
  } | null;
  status: RentalStatus;
  /** Prepends `[UAT] ` to the header when true. */
  uatPrefix?: boolean;
}

// ---------------------------------------------------------------------
// Formatting helpers — kept private
// ---------------------------------------------------------------------

function tierLabel(tier: string): string {
  return tier === 'premium-plus' ? 'Premium+' : 'Premium';
}

function genderLabel(gender: string): string {
  return gender === 'mens' ? "Men's" : "Women's";
}

function formatRentalDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '?';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatSatangAsThb(satang: number): string {
  return (satang / 100).toLocaleString();
}

function formatPrice(p: number | string): string {
  const n = typeof p === 'string' ? Number(p) : p;
  return Number.isFinite(n) ? n.toLocaleString() : String(p);
}

function deliveryLine(rental: RentalLineInput['rental']): string {
  const timeInfo = [
    rental.delivery_time
      ? `${rental.delivery_requested ? 'Delivery' : 'Pickup'}: ${rental.delivery_time}`
      : '',
    rental.return_time ? `Return: ${rental.return_time}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return rental.delivery_requested
    ? `📍 Delivery to: ${rental.delivery_address ?? ''}${timeInfo ? ` (${timeInfo})` : ''}`
    : `📍 Pickup at LENGOLF${timeInfo ? ` (${timeInfo})` : ''}`;
}

function addOnsLine(addOnsRaw: unknown): string | null {
  if (!Array.isArray(addOnsRaw) || addOnsRaw.length === 0) return null;
  const items = addOnsRaw as Array<{ label?: string; price?: number }>;
  const formatted = items
    .filter(a => a && a.label)
    .map(a => (typeof a.price === 'number' ? `${a.label} (฿${a.price})` : a.label))
    .join(', ');
  return formatted ? `🎒 Add-ons: ${formatted}` : null;
}

function paymentMethodChosenLabel(value: string | null | undefined): string | null {
  if (value === 'online_shopeepay') return 'Online (ShopeePay — card or wallet)';
  if (value === 'cash_at_pickup') return 'Cash at pickup';
  return null;
}

function contactPreferenceLabel(value: string | null | undefined): string | null {
  if (value === 'line') return 'LINE';
  if (value === 'email') return 'Email';
  if (value === 'whatsapp') return 'WhatsApp';
  return null;
}

// ---------------------------------------------------------------------
// State-specific composition
// ---------------------------------------------------------------------

interface StateRender {
  /** Header sandwich emoji on both sides (e.g. '✅') and the title (e.g. 'PAYMENT RECEIVED'). */
  headerEmoji: string;
  headerTitle: string;
  /** Whether to bracket the title with the header emoji on the right side too. Most do. */
  bracketed: boolean;
  /** The money line (always present). */
  moneyLine: string;
  /** Optional reference id line (Txn, Refund SN). */
  referenceLine: string | null;
  /** Optional failure-reason line. */
  failureLine: string | null;
  /** Footer action line below the bottom separator. */
  footerLine: string;
}

function renderState(input: RentalLineInput): StateRender {
  const { rental, status } = input;
  const totalDisplay = `฿${formatPrice(rental.total_price)}`;
  const pickupOrDeliveryNoun = rental.delivery_requested ? 'delivery' : 'pickup';

  switch (status.kind) {
    case 'Created': {
      return {
        headerEmoji: '📝',
        headerTitle: 'NEW CLUB RENTAL',
        bracketed: true,
        moneyLine: `💰 Total: ${totalDisplay}`,
        referenceLine: null,
        failureLine: null,
        footerLine:
          status.paymentMode === 'online'
            ? `⌛ Awaiting ShopeePay payment — auto-cancels in 30 min if unpaid.`
            : `👉 Please contact the customer to confirm availability and arrange payment.`,
      };
    }
    case 'Paid': {
      const gateway = status.gatewayLabel ?? 'ShopeePay';
      return {
        headerEmoji: '✅',
        headerTitle: 'PAYMENT RECEIVED',
        bracketed: true,
        moneyLine: `💰 Total: ${totalDisplay} (PAID via ${gateway})`,
        referenceLine: status.transactionSn ? `🔖 Txn: ${status.transactionSn}` : null,
        failureLine: null,
        footerLine: `👉 Booking confirmed — please prep clubs for ${pickupOrDeliveryNoun}.`,
      };
    }
    case 'PaymentFailed': {
      return {
        headerEmoji: '❌',
        headerTitle: 'PAYMENT FAILED',
        bracketed: true,
        moneyLine: `💰 Total: ${totalDisplay}`,
        referenceLine: null,
        failureLine: status.reason ? `⚠️ Failure reason: ${status.reason}` : null,
        footerLine: `👉 Customer should retry. Reservation still held until 30-min window expires.`,
      };
    }
    case 'Refunded': {
      // Full refund — booking is effectively cancelled. Use the same
      // 🚫 CANCELLED header pattern as the bay-booking cancellation flow.
      return {
        headerEmoji: '🚫',
        headerTitle: 'RENTAL CANCELLED — REFUNDED',
        bracketed: true,
        moneyLine: `💰 Original: ${totalDisplay}\n↩️ Refunded: ฿${formatSatangAsThb(status.refundedSatang)} (Full)`,
        referenceLine: status.refundSn ? `🔖 Refund SN: ${status.refundSn}` : null,
        failureLine: null,
        footerLine: `🗑️ Refunded via ShopeePay — clubs released back to inventory.`,
      };
    }
    case 'PartiallyRefunded': {
      const totalSatang = Math.round(Number(rental.total_price) * 100);
      const remainingSatang = Math.max(totalSatang - status.totalRefundedSatang, 0);
      return {
        headerEmoji: '↩️',
        headerTitle: 'PARTIAL REFUND',
        bracketed: true,
        moneyLine:
          `💰 Original: ${totalDisplay}\n` +
          `↩️ Refunded: ฿${formatSatangAsThb(status.refundedThisTimeSatang)} ` +
          `(Partial — ฿${formatSatangAsThb(remainingSatang)} remaining)`,
        referenceLine: status.refundSn ? `🔖 Refund SN: ${status.refundSn}` : null,
        failureLine: null,
        footerLine: `👉 Partial refund issued — booking remains active.`,
      };
    }
    case 'Expired': {
      return {
        headerEmoji: '⌛',
        headerTitle: 'RENTAL EXPIRED — UNPAID',
        bracketed: true,
        moneyLine: `💰 Total: ${totalDisplay} (never paid)`,
        referenceLine: null,
        failureLine: null,
        footerLine: `🗑️ Auto-cancelled — customer didn't complete payment in 30 min. Slot released.`,
      };
    }
  }
}

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Order-level composer — one staff ping for a MULTI-set order
// ---------------------------------------------------------------------

export interface OrderCreatedLineInput {
  order_code: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string;
  duration_days: number | null;
  delivery_requested: boolean | null;
  delivery_address: string | null;
  delivery_time: string | null;
  return_time: string | null;
  /** One entry per rented set (lines of the order). */
  sets: Array<{ name: string; tier: string; gender: string }>;
  /** Order-level add-ons (charged once); shape: [{ label, price }]. */
  add_ons?: unknown;
  total_price: number | string;
  notes: string | null;
  payment_method_chosen?: string | null;
  contact_preference?: string | null;
  /** 'online' = awaiting prepay; 'manual' = staff arranges payment. */
  paymentMode: 'online' | 'manual';
  uatPrefix?: boolean;
}

/**
 * Compose a single staff LINE notification for a freshly-created multi-set
 * course-rental ORDER. Mirrors the `Created` state of composeRentalLineMessage
 * but keys off the CRO order code and lists every set, so a multi-set trip is
 * one ping instead of N. Single-set orders keep using composeRentalLineMessage.
 */
export function composeOrderCreatedLineMessage(input: OrderCreatedLineInput): string {
  const prefix = input.uatPrefix ? '[UAT] ' : '';
  const header = `${prefix}📝 NEW CLUB RENTAL ORDER (ID: ${input.order_code}) 📝`;

  const daysLabel =
    input.duration_days && input.duration_days > 1 ? `${input.duration_days}d` : '1d';

  const setLines = input.sets.map(
    (s, i) =>
      `🏌️ Set ${i + 1}: ${s.name} (${tierLabel(s.tier)}, ${genderLabel(s.gender)})`,
  );

  const paymentChosenLabel = paymentMethodChosenLabel(input.payment_method_chosen);
  const contactPrefLabel = contactPreferenceLabel(input.contact_preference);

  const footerLine =
    input.paymentMode === 'online'
      ? `⌛ Awaiting ShopeePay payment — auto-cancels in 30 min if unpaid.`
      : `👉 Please contact the customer to confirm availability and arrange payment.`;

  const lines: Array<string | null> = [
    header,
    SEPARATOR,
    `👤 Customer: ${input.customer_name}`,
    input.customer_phone ? `📞 Phone: ${input.customer_phone}` : null,
    input.customer_email ? `📧 Email: ${input.customer_email}` : null,
    contactPrefLabel ? `💬 Contact via: ${contactPrefLabel}` : null,
    `📦 ${input.sets.length} sets in this order:`,
    ...setLines,
    `🗓️ Dates: ${formatRentalDate(input.start_date)} - ${formatRentalDate(input.end_date)} (${daysLabel})`,
    deliveryLine({
      delivery_requested: input.delivery_requested,
      delivery_address: input.delivery_address,
      delivery_time: input.delivery_time,
      return_time: input.return_time,
    } as RentalLineInput['rental']),
    addOnsLine(input.add_ons),
    `💰 Order total: ฿${formatPrice(input.total_price)}`,
    paymentChosenLabel ? `💳 Payment: ${paymentChosenLabel}` : null,
    input.notes ? `📝 Notes: ${input.notes}` : null,
    SEPARATOR,
    footerLine,
  ];

  return lines.filter((l): l is string => l !== null).join('\n');
}

export interface OrderPaidLineInput {
  order_code: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  start_date: string;
  end_date: string;
  duration_days: number | null;
  delivery_requested: boolean | null;
  delivery_address: string | null;
  delivery_time: string | null;
  return_time: string | null;
  sets: Array<{ name: string; tier: string; gender: string }>;
  add_ons?: unknown;
  total_price: number | string;
  notes: string | null;
  contact_preference?: string | null;
  transactionSn?: string | null;
  uatPrefix?: boolean;
}

/**
 * Compose one staff LINE notification when a multi-set course-rental ORDER is
 * paid. Mirrors the `Paid` state of composeRentalLineMessage but at the order
 * level (CRO code + all sets + order total). Single-set orders keep using the
 * per-line composeRentalLineMessage.
 */
export function composeOrderPaidLineMessage(input: OrderPaidLineInput): string {
  const prefix = input.uatPrefix ? '[UAT] ' : '';
  const header = `${prefix}✅ ORDER PAYMENT RECEIVED (ID: ${input.order_code}) ✅`;

  const daysLabel =
    input.duration_days && input.duration_days > 1 ? `${input.duration_days}d` : '1d';
  const setLines = input.sets.map(
    (s, i) => `🏌️ Set ${i + 1}: ${s.name} (${tierLabel(s.tier)}, ${genderLabel(s.gender)})`,
  );
  const contactPrefLabel = contactPreferenceLabel(input.contact_preference);
  const pickupOrDeliveryNoun = input.delivery_requested ? 'delivery' : 'pickup';

  const lines: Array<string | null> = [
    header,
    SEPARATOR,
    `👤 Customer: ${input.customer_name}`,
    input.customer_phone ? `📞 Phone: ${input.customer_phone}` : null,
    input.customer_email ? `📧 Email: ${input.customer_email}` : null,
    contactPrefLabel ? `💬 Contact via: ${contactPrefLabel}` : null,
    `📦 ${input.sets.length} sets in this order:`,
    ...setLines,
    `🗓️ Dates: ${formatRentalDate(input.start_date)} - ${formatRentalDate(input.end_date)} (${daysLabel})`,
    deliveryLine({
      delivery_requested: input.delivery_requested,
      delivery_address: input.delivery_address,
      delivery_time: input.delivery_time,
      return_time: input.return_time,
    } as RentalLineInput['rental']),
    addOnsLine(input.add_ons),
    `💰 Order total: ฿${formatPrice(input.total_price)} (PAID via ShopeePay)`,
    input.transactionSn ? `🔖 Txn: ${input.transactionSn}` : null,
    input.notes ? `📝 Notes: ${input.notes}` : null,
    SEPARATOR,
    `👉 Booking confirmed — please prep clubs for ${pickupOrDeliveryNoun}.`,
  ];

  return lines.filter((l): l is string => l !== null).join('\n');
}

export function composeRentalLineMessage(input: RentalLineInput): string {
  const { rental, clubSet, uatPrefix } = input;
  const state = renderState(input);

  const prefix = uatPrefix ? '[UAT] ' : '';
  const headerRight = state.bracketed ? ` ${state.headerEmoji}` : '';
  const header = `${prefix}${state.headerEmoji} ${state.headerTitle} (ID: ${rental.rental_code})${headerRight}`;

  const daysLabel =
    rental.duration_days && rental.duration_days > 1 ? `${rental.duration_days}d` : '1d';

  const setLine = clubSet
    ? `🏌️ Set: ${clubSet.name} (${tierLabel(clubSet.tier)}, ${genderLabel(clubSet.gender)})`
    : null;

  const paymentChosenLabel = paymentMethodChosenLabel(rental.payment_method_chosen);
  const contactPrefLabel = contactPreferenceLabel(rental.contact_preference);

  const lines: Array<string | null> = [
    header,
    SEPARATOR,
    `👤 Customer: ${rental.customer_name}`,
    rental.customer_phone ? `📞 Phone: ${rental.customer_phone}` : null,
    rental.customer_email ? `📧 Email: ${rental.customer_email}` : null,
    contactPrefLabel ? `💬 Contact via: ${contactPrefLabel}` : null,
    setLine,
    `🗓️ Dates: ${formatRentalDate(rental.start_date)} - ${formatRentalDate(rental.end_date)} (${daysLabel})`,
    deliveryLine(rental),
    addOnsLine(rental.add_ons),
    state.moneyLine,
    paymentChosenLabel ? `💳 Payment: ${paymentChosenLabel}` : null,
    state.referenceLine,
    state.failureLine,
    rental.notes ? `📝 Notes: ${rental.notes}` : null,
    SEPARATOR,
    state.footerLine,
  ];

  return lines.filter((l): l is string => l !== null).join('\n');
}
