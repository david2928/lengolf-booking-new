/**
 * A confirmation that did not send must not be logged as one that did.
 *
 * `sendConfirmationEmail` reports failure by RETURNING FALSE — it swallows its
 * own errors so a mail problem can never fail a booking. `sendBookingConfirmationEmail`
 * used to await it and throw the boolean away, so it resolved either way. Its
 * caller in `app/api/bookings/create/route.ts` wraps it in `Promise.allSettled`
 * and writes `booking_process_logs` from the settled status, so every failed
 * send was recorded as `Email notification | success`.
 *
 * That is not a cosmetic logging bug. It is the only signal we have that a
 * customer did not get their confirmation — booking BK260803FKLR sat in the
 * table for hours reading `success: true, recipient: "r"` while nodemailer had
 * refused the envelope outright.
 */
import { sendBookingConfirmationEmail } from '@/lib/notifications/bookingEmail';
import { sendConfirmationEmail } from '@/lib/emailService';

jest.mock('@/lib/emailService', () => ({
  sendConfirmationEmail: jest.fn(),
  resolveEmailLocale: (v: unknown) => (typeof v === 'string' ? v : 'en'),
}));

const mockSend = sendConfirmationEmail as jest.MockedFunction<typeof sendConfirmationEmail>;

const LEGACY = {
  userName: 'Rowan McKenzie',
  email: 'rowan@len.golf',
  date: '2026-08-03',
  startTime: '15:30',
  endTime: '17:00',
  duration: 1.5,
  numberOfPeople: 1,
};

/** The shape the create route actually sends — formatter output. */
const standardized = (email: string) => ({
  ...LEGACY,
  email,
  standardizedData: {
    emailData: { userDisplayName: 'Rowan McKenzie', subject: 'Booking Confirmation' },
    bookingId: 'BK260803FKLR',
    customerName: 'Rowan McKenzie',
    email,
    phoneNumber: '+66923494048',
    date: '2026-08-03',
    formattedDate: 'Mon, 3rd August',
    startTime: '15:30',
    endTime: '17:00',
    bayName: 'Bay 2',
    duration: 1.5,
    numberOfPeople: 1,
  },
});

beforeEach(() => {
  mockSend.mockReset();
});

describe('a send that failed', () => {
  test('throws instead of resolving, so allSettled reports it rejected', async () => {
    mockSend.mockResolvedValue(false);
    await expect(sendBookingConfirmationEmail(standardized('rowan@len.golf')))
      .rejects.toThrow('Booking confirmation email not sent');
  });

  test('...and the same holds on the legacy payload shape', async () => {
    mockSend.mockResolvedValue(false);
    await expect(sendBookingConfirmationEmail(LEGACY))
      .rejects.toThrow('Booking confirmation email not sent');
  });

  test('the settled status is what the route reads, and it now disagrees with success', async () => {
    // Reproduces the route's own wrapper. Before the fix both branches were
    // 'fulfilled' and the process log said success either way.
    mockSend.mockResolvedValue(false);
    const [failed] = await Promise.allSettled([
      sendBookingConfirmationEmail(standardized('rowan@len.golf')),
    ]);
    mockSend.mockResolvedValue(true);
    const [sent] = await Promise.allSettled([
      sendBookingConfirmationEmail(standardized('rowan@len.golf')),
    ]);

    expect(failed.status).toBe('rejected');
    expect(sent.status).toBe('fulfilled');
  });
});

describe('an unusable recipient', () => {
  test.each([
    ['the address that caused this', 'r'],
    ['an empty string', ''],
  ])('%s never reaches SMTP', async (_label, email) => {
    mockSend.mockResolvedValue(true);
    await expect(sendBookingConfirmationEmail(standardized(email)))
      .rejects.toThrow('no usable recipient address');
    // The point of the guard: a connect + AUTH round trip to learn what a
    // regex already knew.
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a null address (nothing usable was on file either) is refused, not coerced', async () => {
    mockSend.mockResolvedValue(true);
    await expect(
      sendBookingConfirmationEmail(standardized(null as unknown as string)),
    ).rejects.toThrow('no usable recipient address');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('a send that worked', () => {
  test('resolves, and passes the recipient through untouched', async () => {
    mockSend.mockResolvedValue(true);
    await expect(sendBookingConfirmationEmail(standardized('rowan@len.golf'))).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ email: 'rowan@len.golf' });
  });
});
