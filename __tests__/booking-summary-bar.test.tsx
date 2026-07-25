/**
 * Shared sticky action bar. The contract that matters: the CTA is NEVER
 * disabled for validation reasons, because the caller validates on tap and
 * scrolls to the offending field. It is only disabled while a submit is in
 * flight. A greyed-out button with no explanation was the exact dead end this
 * component exists to remove.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';

function renderBar(props: Partial<React.ComponentProps<typeof BookingSummaryBar>> = {}) {
  const onCta = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <BookingSummaryBar
        total={925}
        totalLabel="Total"
        subline="1.5 h, 13:00 to 14:30"
        ctaLabel="Confirm booking"
        onCta={onCta}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onCta };
}

describe('BookingSummaryBar', () => {
  test('renders the total formatted with a baht sign and thousands separator', () => {
    renderBar({ total: 1500 });
    expect(screen.getByText('฿1,500')).toBeInTheDocument();
  });

  test('renders the subline', () => {
    renderBar();
    expect(screen.getByText('1.5 h, 13:00 to 14:30')).toBeInTheDocument();
  });

  test('CTA is enabled even when the form is incomplete', async () => {
    const { onCta } = renderBar();
    const button = screen.getByRole('button', { name: 'Confirm booking' });

    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  test('CTA is disabled only while loading, and does not fire', async () => {
    const { onCta } = renderBar({ ctaLoading: true });
    const button = screen.getByRole('button', { name: /Confirm booking/ });

    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onCta).not.toHaveBeenCalled();
  });

  test('shows the empty prompt instead of a zero total when total is 0', () => {
    renderBar({ total: 0, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('Choose a duration')).toBeInTheDocument();
    expect(screen.queryByText('฿0')).not.toBeInTheDocument();
  });

  test('shows a real ฿0 total when the price is genuinely zero', () => {
    renderBar({ total: 0, emptyPrompt: 'Choose a duration', isZeroValid: true });
    expect(screen.getByText('฿0')).toBeInTheDocument();
    expect(screen.queryByText('Choose a duration')).not.toBeInTheDocument();
  });
});
