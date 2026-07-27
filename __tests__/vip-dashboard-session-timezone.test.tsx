/**
 * Upcoming-session rendering for the VIP dashboard.
 *
 * `booking.date` and `booking.startTime` are Asia/Bangkok wall-clock values.
 * They used to be joined into ``new Date(`${dateStr}T${timeStr}`)``, which has
 * no offset and therefore resolves in the *viewer's* zone: a 10:00 Bangkok
 * session read 08:00 on a Tokyo phone, and a late-evening one slipped to the
 * previous day. Pinning next-intl's display zone (PR #113) did not help — that
 * fixed how the instant is rendered, not which instant was built.
 *
 * The VIP surface sits behind auth, so it cannot be smoke-tested with a dev
 * server and a page load the way the LIFF pages can. This suite is the
 * substitute: it renders the real component through a real
 * NextIntlClientProvider, so it also exercises `format.dateTime` with an
 * explicit `timeZone` — the part typecheck and build cannot validate.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import DashboardView from '@/components/vip/DashboardView';
import messages from '@/messages/en.json';

function renderDashboard(booking: { date: string; time: string; duration?: number }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <DashboardView isMatched userName="Test Customer" nextBooking={{ id: 'BK-1', ...booking }} />
    </NextIntlClientProvider>,
  );
}

describe('VIP dashboard upcoming session', () => {
  it('renders the booked Bangkok wall-clock time', () => {
    renderDashboard({ date: '2026-07-30', time: '10:00' });

    // Not 8:00 AM (what a Tokyo viewer saw) and not 11:00 PM the previous day.
    expect(screen.queryByText(/10:00\s*AM/i)).not.toBeNull();
  });

  it('renders the booked Bangkok date', () => {
    renderDashboard({ date: '2026-07-30', time: '10:00' });

    expect(screen.queryByText(/Thursday, Jul 30/)).not.toBeNull();
  });

  it('does not roll a late-evening session into the next day', () => {
    // 22:00 Bangkok is 00:00 the following day in Tokyo — the case where the
    // hour error became a visible date error.
    renderDashboard({ date: '2026-07-30', time: '22:00' });

    expect(screen.queryByText(/Thursday, Jul 30/)).not.toBeNull();
    expect(screen.queryByText(/Jul 31/)).toBeNull();
  });
});
