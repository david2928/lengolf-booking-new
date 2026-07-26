/**
 * The two secondary affordances of the booking flow, and the rule that keeps
 * them apart.
 *
 * The bug: "Change" (navigates back into a half-filled form) and "View Details"
 * (opens a read-only modal) rendered a few rows apart as the same green
 * underlined text at nearly the same size. Same affordance, opposite
 * consequence.
 *
 * These tests pin the DIFFERENCE rather than the exact styling. Colours and
 * spacing are free to move; what must not come back is the two of them
 * converging on one look.
 */
import { render, screen } from '@testing-library/react';
import {
  ChangeAnswerButton,
  RevealDetailsButton,
} from '@/app/[locale]/(features)/bookings/components/booking/affordances';
import { DetailsSubStepSummary } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/DetailsSubStepSummary';

function classesOf(label: string): string {
  return screen.getByRole('button', { name: new RegExp(label) }).className;
}

describe('booking flow affordances', () => {
  /**
   * Every one of these renders inside the booking `<form>`. A button with no
   * explicit type defaults to `submit`, so a missing `type="button"` here does
   * not misdraw a link, it fires the booking. This is the reason the rule was
   * worth making a component at all rather than a pair of class strings.
   */
  it('never defaults to a submit button', () => {
    render(
      <>
        <RevealDetailsButton onClick={() => {}}>View Details</RevealDetailsButton>
        <ChangeAnswerButton onClick={() => {}}>Change</ChangeAnswerButton>
      </>,
    );

    for (const label of ['View Details', 'Change']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveAttribute(
        'type',
        'button',
      );
    }
  });

  /**
   * The collision itself. Underline was the shared signal, so neither may carry
   * it, and green is now spent only on the one that touches the booking.
   */
  it('draws the two kinds differently', () => {
    render(
      <>
        <RevealDetailsButton onClick={() => {}}>View Details</RevealDetailsButton>
        <ChangeAnswerButton onClick={() => {}}>Change</ChangeAnswerButton>
      </>,
    );

    const reveal = classesOf('View Details');
    const change = classesOf('Change');

    expect(reveal).not.toMatch(/\bunderline\b/);
    expect(change).not.toMatch(/\bunderline\b/);

    // Green means "this changes your booking" and belongs to exactly one of them.
    expect(change).toMatch(/green/);
    expect(reveal).not.toMatch(/green/);

    // The navigational one is a bordered control, not text.
    expect(change).toMatch(/\bborder\b/);
    expect(reveal).not.toMatch(/\bborder\b/);
  });

  /**
   * The AI Lab callout's back link is the most destructive control on the step
   * (it unmounts step 3 for step 2) and lives inside an amber box, so it takes
   * the callout's palette. It must still read as the SAME kind of control as a
   * plain "Change" — a border and no underline — or the tone escape hatch has
   * quietly become a third bucket.
   */
  it('keeps the warning tone in the navigational bucket', () => {
    render(
      <ChangeAnswerButton onClick={() => {}} tone="warning">
        Go back
      </ChangeAnswerButton>,
    );

    const warning = classesOf('Go back');
    expect(warning).toMatch(/\bborder\b/);
    expect(warning).not.toMatch(/\bunderline\b/);
    expect(warning).toMatch(/yellow/);
  });

  it('calls back on click', async () => {
    const onClick = jest.fn();
    render(<RevealDetailsButton onClick={onClick}>View Details</RevealDetailsButton>);

    screen.getByRole('button', { name: /View Details/ }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

/**
 * The row both affordances live on, and the two shapes it serves.
 *
 * `DetailsSubStepSummary` started as the collapsed sub-step summary —
 * `label + value + Change`. The session sub-step's slot chip needed
 * `value + Info + Change`: no sub-step to name, and one extra affordance. The
 * two were generalised into this one component rather than forked, because they
 * differ only in what they omit and they make the same promise — this row states
 * a settled decision, and the control at its end re-opens it. A parallel
 * component would have been free to drift on the border, the fill, the
 * separator, or which kind of button ends the row.
 *
 * These pin the properties that made merging them safe.
 */
describe('the recap row that hosts them', () => {
  const renderRow = (props: Partial<React.ComponentProps<typeof DetailsSubStepSummary>> = {}) =>
    render(
      <DetailsSubStepSummary
        value="1 hr · 1 person"
        changeLabel="Change"
        onChange={() => {}}
        {...props}
      />,
    );

  it('names its sub-step when given a label, and says nothing extra without one', () => {
    const { unmount } = renderRow({ label: 'Session' });
    expect(screen.getByText('Session')).toBeInTheDocument();
    // The separator is a literal " · " so it survives copy/paste and a screen
    // reader, which is why it is asserted as text rather than as a margin.
    expect(screen.getByText('Session').parentElement!.textContent).toBe('Session · 1 hr · 1 person');
    unmount();

    renderRow();
    expect(screen.queryByText('Session')).toBeNull();
    // ...and no orphaned separator where the label would have been.
    expect(screen.getByText('1 hr · 1 person').textContent).toBe('1 hr · 1 person');
  });

  it('renders a secondary affordance between the value and the Change control', () => {
    renderRow({
      secondaryAction: <RevealDetailsButton onClick={() => {}}>Info</RevealDetailsButton>,
    });

    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAccessibleName('Info');
    expect(second).toHaveAccessibleName('Change');
  });

  it('has exactly one control when no secondary affordance is passed', () => {
    renderRow();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  /**
   * The layout the slot chip needed. At 360px the chip's three facts plus two
   * controls do not fit on one line, and the old `justify-between` + `truncate`
   * dropped the trailing segment — which for the chip is the BAY, the fact the
   * Info link beside it explains.
   *
   * So the row wraps and the pill is pushed by an auto margin rather than by
   * `justify-between`, because auto margins resolve per flex line: the pill
   * stays against the right edge whether it shares a line or has one to itself.
   * Class assertions rather than measurements, since JSDOM does no layout.
   */
  it('wraps rather than truncating, and keeps the pill right on either line', () => {
    const { container } = renderRow({
      secondaryAction: <RevealDetailsButton onClick={() => {}}>Info</RevealDetailsButton>,
    });

    const row = container.firstElementChild!;
    expect(row.className).toContain('flex-wrap');

    const value = screen.getByText('1 hr · 1 person');
    expect(value.className).not.toContain('truncate');
    // Not `flex-1` either: a growing value would push the Info link away from
    // the bay name it belongs to and over to the action cluster.
    expect(value.className).not.toMatch(/\bflex-1\b/);

    expect(screen.getByRole('button', { name: 'Change' }).className).toContain('ml-auto');
  });
});
