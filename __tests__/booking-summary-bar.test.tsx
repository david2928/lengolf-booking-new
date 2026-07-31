/**
 * Shared sticky action bar. The contract that matters: the CTA is NEVER
 * disabled for validation reasons, because the caller validates on tap and
 * scrolls to the offending field. It is only disabled while a submit is in
 * flight. A greyed-out button with no explanation was the exact dead end this
 * component exists to remove.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import {
  BookingSummaryBar,
  BOOKING_SUMMARY_BAR_SPACER,
} from '@/components/shared/BookingSummaryBar';

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

  // subline is typed as ReactNode (not just string) specifically so callers
  // like RentalPriceSummaryBar can colour individual segments — e.g. green
  // for a savings amount, amber for a delivery surcharge. Pin this so the
  // prop never gets narrowed back to `string`, which would silently flatten
  // those colour cues.
  test('renders a ReactNode subline, preserving nested coloured markup', () => {
    renderBar({
      subline: (
        <>
          2d <span className="text-green-600">save ฿300</span>
        </>
      ),
    });

    const savingsSpan = screen.getByText('save ฿300');
    expect(savingsSpan).toBeInTheDocument();
    expect(savingsSpan.tagName).toBe('SPAN');
    expect(savingsSpan).toHaveClass('text-green-600');
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

  test('shows the empty prompt instead of a zero total when total is null', () => {
    renderBar({ total: null, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('Choose a duration')).toBeInTheDocument();
    expect(screen.queryByText('฿0')).not.toBeInTheDocument();
  });

  test('shows a real ฿0 total when the price is genuinely zero', () => {
    renderBar({ total: 0, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('฿0')).toBeInTheDocument();
    expect(screen.queryByText('Choose a duration')).not.toBeInTheDocument();
  });

  // A bad total (NaN, Infinity, negative) should never reach a paying
  // customer. `rate * hours` with an unresolved rate, or a `reduce` over
  // partially-loaded pricing data, can produce NaN — these guard against
  // rendering it.
  test('treats NaN as unpriced rather than rendering ฿NaN', () => {
    renderBar({ total: NaN, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('Choose a duration')).toBeInTheDocument();
    expect(screen.queryByText('฿NaN')).not.toBeInTheDocument();
  });

  test('treats Infinity as unpriced rather than rendering ฿∞', () => {
    renderBar({ total: Infinity, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('Choose a duration')).toBeInTheDocument();
    expect(screen.queryByText('฿∞')).not.toBeInTheDocument();
  });

  test('treats a negative total as unpriced rather than rendering ฿-500', () => {
    renderBar({ total: -500, emptyPrompt: 'Choose a duration' });
    expect(screen.getByText('Choose a duration')).toBeInTheDocument();
    expect(screen.queryByText('฿-500')).not.toBeInTheDocument();
  });
});

describe('BookingSummaryBar has-summary-bar body class (refcounted)', () => {
  function renderInstance(props: Partial<React.ComponentProps<typeof BookingSummaryBar>> = {}) {
    return render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <BookingSummaryBar
          total={925}
          totalLabel="Total"
          ctaLabel="Confirm booking"
          onCta={jest.fn()}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  }

  afterEach(() => {
    // Belt-and-suspenders in case a test below leaves the class set — RTL's
    // automatic cleanup unmounts components but this guards against a
    // future test forgetting to call unmount() explicitly.
    document.body.classList.remove('has-summary-bar');
  });

  test('adds the class while mounted and removes it on unmount', () => {
    const { unmount } = renderInstance();
    expect(document.body.classList.contains('has-summary-bar')).toBe(true);

    unmount();
    expect(document.body.classList.contains('has-summary-bar')).toBe(false);
  });

  test('keeps the class present after unmounting one of two mounted instances', () => {
    const a = renderInstance();
    const b = renderInstance();
    expect(document.body.classList.contains('has-summary-bar')).toBe(true);

    a.unmount();
    expect(document.body.classList.contains('has-summary-bar')).toBe(true);

    b.unmount();
    expect(document.body.classList.contains('has-summary-bar')).toBe(false);
  });
});

/**
 * The clearance for the fixed bar belongs to the FORM, never to <body>.
 *
 * A `body.has-summary-bar { padding-bottom }` rule shipped once and produced a
 * scrollbar on screens whose content ended well above the fold: both flows that
 * mount the bar render inside `Layout`'s `min-h-screen` shell, so the document
 * is already a full viewport tall, and padding on <body> sits outside that box
 * and is purely additive. It was also doubling BOOKING_SUMMARY_BAR_SPACER,
 * which both consumers already apply inside the flow.
 *
 * jsdom does not evaluate the stylesheet, so this reads the source. A CSS fact
 * with no runtime assertion behind it is exactly the kind that gets reinstated
 * by the next person who sees the bar overlap something.
 */
describe('the summary bar never pads the document', () => {
  const globalsCssSource = readFileSync(
    join(__dirname, '..', 'app', 'globals.css'),
    'utf8',
  );
  /* Declarations only. The rule this pins is explained at length in a comment
     that necessarily QUOTES the selector it is warning about, and matching
     against that prose made the first version of this test fail on the very
     comment documenting the fix. */
  const globalsCss = globalsCssSource.replace(/\/\*[\s\S]*?\*\//g, '');

  test('no body.has-summary-bar rule sets padding-bottom', () => {
    // Every `body.has-summary-bar { ... }` block that is not a descendant
    // selector (the chat-FAB rule is `body.has-summary-bar [data-chat-fab]`,
    // which legitimately targets something else).
    const bodyBlocks = [
      ...globalsCss.matchAll(/body\.has-summary-bar\s*\{([^}]*)\}/g),
    ].map((match) => match[1]);

    expect(bodyBlocks.filter((body) => /padding-bottom/.test(body))).toEqual([]);
  });

  test('the chat FAB rule keyed off the same class is still there', () => {
    // The class is refcounted and asserted above precisely so this can work;
    // removing the padding rule must not take the FAB offset with it.
    expect(globalsCss).toMatch(/body\.has-summary-bar\s+\[data-chat-fab\]/);
  });

  test('the spacer consumers apply is a bottom padding', () => {
    expect(BOOKING_SUMMARY_BAR_SPACER).toMatch(/^pb-/);
  });
});
