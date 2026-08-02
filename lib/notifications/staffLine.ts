/**
 * Staff LINE notifications, callable directly.
 *
 * The message builder and the push both used to live inside
 * `app/api/notifications/line/route.ts`, which meant the only way to send a
 * staff notification was to HTTP POST our own serverless function over the
 * public URL — a second invocation, a network round trip and a TLS handshake
 * on top of the actual LINE API call.
 *
 * The route still exists and still behaves identically; it now delegates here.
 * Callers that already hold the payload in-process (booking creation) should
 * import these directly instead.
 */

export interface BookingCreatedLinePayload {
  customerName?: string;
  bookingName?: string;
  email?: string;
  phoneNumber?: string;
  bookingDate?: string;
  bookingStartTime?: string;
  bookingEndTime?: string;
  bayNumber?: string;
  duration?: number;
  numberOfPeople?: number;
  packageInfo?: string;
  bookingType?: string;
  packageName?: string;
  customerCode?: string;
  customerNotes?: string;
  channel?: string;
  bookingId?: string;
  standardizedData?: {
    lineNotification: {
      bookingName: string;
      customerLabel: string;
    };
    bookingId: string;
    customerName: string;
    email: string;
    phoneNumber: string;
    date: string;
    formattedDate: string;
    startTime: string;
    endTime: string;
    bayName: string;
    duration: number;
    numberOfPeople: number;
    isNewCustomer?: boolean;
    customerCode?: string;
  };
}

/** Thrown by `pushToStaffGroup` so the route can reproduce its HTTP response. */
export class StaffLineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'StaffLineError';
  }
}

/** Format a date with an ordinal day suffix, e.g. "Thu, 31st July". */
export function formatDateWithOrdinal(dateString: string): string {
  try {
    const dateObj = new Date(dateString);
    const day = dateObj.getDate();
    const dayWithSuffix = day + (
      day === 1 || day === 21 || day === 31 ? 'st' :
      day === 2 || day === 22 ? 'nd' :
      day === 3 || day === 23 ? 'rd' : 'th'
    );
    const formatted = dateObj.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long'
    });
    // Replace the day number with the day + suffix, and ensure weekday has comma
    return formatted.replace(/\b\d+\b/, dayWithSuffix).replace(/^(\w+)/, '$1,');
  } catch {
    console.warn('Error formatting date, using raw:', dateString);
    return dateString; // fallback
  }
}

/**
 * Build the staff-group text for a newly created booking.
 *
 * Moved verbatim from the route handler — the exact wording and field order are
 * what staff read off their phones, so `__tests__/staff-line-message.test.ts`
 * pins the output.
 */
export function buildBookingCreatedMessage(data: BookingCreatedLinePayload): string {
  let sanitizedBooking: Record<string, unknown>;

  if (data.standardizedData) {
    const std = data.standardizedData;
    const isNewCustomer = !data.customerCode && !std.customerCode;
    sanitizedBooking = {
      customerName: isNewCustomer ? "New Customer" : (std.lineNotification.customerLabel || std.customerName),
      bookingName: std.lineNotification.bookingName,
      email: std.email,
      phoneNumber: std.phoneNumber,
      bookingDate: std.formattedDate,
      bookingStartTime: std.startTime,
      bookingEndTime: std.endTime,
      bayNumber: std.bayName,
      duration: std.duration,
      numberOfPeople: std.numberOfPeople,
      packageInfo: data.packageInfo,
      bookingType: data.bookingType,
      packageName: data.packageName,
      customerNotes: data.customerNotes,
      customerCode: data.customerCode || std.customerCode
    };
  } else {
    sanitizedBooking = {
      customerName: data.customerCode ? data.customerName : "New Customer",
      bookingName: data.bookingName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      bookingDate: data.bookingDate,
      bookingStartTime: data.bookingStartTime,
      bookingEndTime: data.bookingEndTime,
      bayNumber: data.bayNumber,
      duration: data.duration,
      numberOfPeople: data.numberOfPeople,
      packageInfo: data.packageInfo,
      bookingType: data.bookingType,
      packageName: data.packageName,
      customerNotes: data.customerNotes,
      customerCode: data.customerCode
    };
  }

  let formattedDate = sanitizedBooking.bookingDate;
  if (!data.standardizedData && sanitizedBooking.bookingDate && typeof sanitizedBooking.bookingDate === 'string') {
    formattedDate = formatDateWithOrdinal(sanitizedBooking.bookingDate);
  }

  const bookingId = data.standardizedData?.bookingId || data.bookingId;
  const bookingIdString = bookingId ? ` (ID: ${bookingId})` : '';

  let messageToSend = `Booking Notification${bookingIdString}`;
  messageToSend += `\nCustomer Name: ${sanitizedBooking.customerName}`;
  messageToSend += `\nBooking Name: ${sanitizedBooking.bookingName}`;
  messageToSend += `\nEmail: ${sanitizedBooking.email || 'Not provided'}`;
  messageToSend += `\nPhone: ${sanitizedBooking.phoneNumber || 'Not provided'}`;
  messageToSend += `\nDate: ${formattedDate}`;
  messageToSend += `\nTime: ${sanitizedBooking.bookingStartTime || 'N/A'} - ${sanitizedBooking.bookingEndTime || 'N/A'}`;
  messageToSend += `\nBay: ${sanitizedBooking.bayNumber || 'N/A'}`;
  // Format the type field to show "Package (packageName)" for packages
  // Use the actual package_name from the booking record (from package_types table)
  let typeDisplay;
  console.log(`[LINE Notification] Debug - bookingType: "${sanitizedBooking.bookingType}", packageName: "${sanitizedBooking.packageName}", packageInfo: "${sanitizedBooking.packageInfo}"`);

  if (sanitizedBooking.bookingType === 'Package' && sanitizedBooking.packageName) {
    typeDisplay = `Package (${sanitizedBooking.packageName})`;
    console.log(`[LINE Notification] Using simulator package format: ${typeDisplay}`);
  } else if (sanitizedBooking.bookingType === 'Play_Food_Package' && sanitizedBooking.packageName) {
    typeDisplay = `Play & Food Package (${sanitizedBooking.packageName})`;
    console.log(`[LINE Notification] Using play & food package format: ${typeDisplay}`);
  } else {
    typeDisplay = sanitizedBooking.packageInfo || 'Normal Bay Rate';
    console.log(`[LINE Notification] Using fallback format: ${typeDisplay}`);
  }
  messageToSend += `\nType: ${typeDisplay}`;
  messageToSend += `\nPeople: ${sanitizedBooking.numberOfPeople || '1'}`;
  messageToSend += `\nChannel: ${data.channel || 'Website'}`;
  if (sanitizedBooking.customerNotes) {
    messageToSend += `\nNotes: ${sanitizedBooking.customerNotes}`;
  }
  messageToSend += `\n\nThis booking has been auto-confirmed. No need to re-confirm with the customer. Please double check bay selection`;

  return messageToSend.trim();
}

/** One field of a modified booking, as staff need to read it. */
export interface ModifiedField<T> {
  from: T;
  to: T;
}

export interface BookingModifiedLinePayload {
  bookingId: string;
  customerName?: string | null;
  phoneNumber?: string | null;
  /** `yyyy-MM-dd`. Pass a `ModifiedField` when it moved. */
  bookingDate: string | ModifiedField<string>;
  /** `HH:mm`. */
  bookingStartTime: string | ModifiedField<string>;
  /** `HH:mm`. */
  bookingEndTime: string | ModifiedField<string>;
  /** Hours. */
  duration: number | ModifiedField<number>;
  /** Display name, e.g. `Bay 1 (Bar)`. */
  bayNumber: string | ModifiedField<string>;
  numberOfPeople?: number | null | ModifiedField<number | null>;
  customerNotes?: string | null;
  /** Where the edit came from, for the audit line. */
  channel?: string;
}

function isModified<T>(value: T | ModifiedField<T>): value is ModifiedField<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'from' in (value as Record<string, unknown>) &&
    'to' in (value as Record<string, unknown>)
  );
}

/**
 * Render a field that may or may not have changed.
 *
 * Unchanged fields print bare so the message still reads as a booking. Changed
 * ones print `old → new`, because the thing staff most need off this message is
 * what is different from the version already written on the whiteboard.
 */
function renderField<T>(value: T | ModifiedField<T>, format: (v: T) => string): string {
  if (!isModified(value)) return format(value);
  return `${format(value.from)} → ${format(value.to)}`;
}

/**
 * Build the staff-group text for a customer-edited booking.
 *
 * Deliberately shows the BAY even when the customer never chose one: an edit can
 * silently reassign it (see `selectBayForEditedSlot`), and a bay move nobody
 * announced is a bay move the desk discovers when two groups arrive at once.
 */
export function buildBookingModifiedMessage(data: BookingModifiedLinePayload): string {
  const asIs = (v: string) => v;
  const dateText = renderField(data.bookingDate, (d) =>
    d ? formatDateWithOrdinal(d) : 'N/A'
  );

  const timeText = isModified(data.bookingStartTime) || isModified(data.bookingEndTime)
    ? `${renderField(data.bookingStartTime, asIs)} - ${renderField(data.bookingEndTime, asIs)}`
    : `${data.bookingStartTime} - ${data.bookingEndTime}`;

  const durationText = renderField(data.duration, (h) => `${h}h`);

  let message = `🔄 BOOKING MODIFIED (ID: ${data.bookingId}) 🔄`;
  message += `\n----------------------------------`;
  message += `\n👤 Customer: ${data.customerName || 'N/A'}`;
  if (data.phoneNumber) message += `\n📞 Phone: ${data.phoneNumber}`;
  message += `\n🗓️ Date: ${dateText}`;
  message += `\n⏰ Time: ${timeText} (${durationText})`;
  message += `\n⛳ Bay: ${renderField(data.bayNumber, asIs)}`;
  if (data.numberOfPeople !== undefined && data.numberOfPeople !== null) {
    message += `\n🧑‍🤝‍🧑 Pax: ${renderField(data.numberOfPeople, (p) => String(p ?? 'N/A'))}`;
  }
  if (data.customerNotes) {
    message += `\n📝 Notes: ${data.customerNotes}`;
  }
  message += `\n----------------------------------`;
  message += `\n✏️ Changed by the customer via ${data.channel || 'the booking site'}`;

  return message.trim();
}

/**
 * Push a text message to the staff LINE group.
 *
 * Throws `StaffLineError` carrying the status the route should surface, so the
 * HTTP wrapper keeps returning exactly what it returned before.
 */
export async function pushToStaffGroup(text: string): Promise<void> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  if (!channelAccessToken) {
    console.error('LINE Messaging API access token is not set');
    throw new StaffLineError('LINE Messaging API access token is not set', 500);
  }

  if (!groupId) {
    console.error('LINE group ID is not set');
    throw new StaffLineError('LINE group ID is not set', 500);
  }

  if (!text) {
    console.error('Message to send is empty');
    throw new StaffLineError('Failed to generate LINE message content', 400);
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    console.error('LINE API error:', response.status, errorData);
    throw new StaffLineError(
      'Failed to send LINE notification to LINE API',
      response.status,
      errorData
    );
  }
}
