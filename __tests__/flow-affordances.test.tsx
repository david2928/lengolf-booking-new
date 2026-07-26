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
