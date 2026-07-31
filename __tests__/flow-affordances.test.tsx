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
 * component would have been free to drift on the separator, the wrap rule, or
 * which kind of button ends the row.
 *
 * These pin the properties that made merging them safe.
 */
describe('the recap row that hosts them', () => {
  const renderRow = (props: Partial<React.ComponentProps<typeof DetailsSubStepSummary>> = {}) =>
    render(
      <DetailsSubStepSummary
        label="Session"
        value="1 hr · 1 person"
        changeLabel="Change"
        onChange={() => {}}
        {...props}
      />,
    );

  it('names its sub-step, so stacked rows are not anonymous fragments', () => {
    renderRow({ label: 'Session' });
    expect(screen.getByText('Session')).toBeInTheDocument();
    // The separator is a literal " · " so it survives copy/paste and a screen
    // reader, which is why it is asserted as text rather than as a margin.
    expect(screen.getByText('Session').parentElement!.textContent).toBe('Session · 1 hr · 1 person');
  });

  /**
   * One control, and it is the Change pill. The row briefly took a
   * `secondaryAction` slot for the slot chip's bay "Info" link; both the chip
   * and the slot are gone, and the explainer lives on the steps where the bay is
   * chosen. A second control appearing here again would mean something had been
   * put back that this row is no longer the place for.
   */
  it('carries exactly one control', () => {
    renderRow();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button')).toHaveAccessibleName('Change');
  });

  /**
   * Collapsing a section must REMOVE weight, not add it. An expanded sub-step is
   * plain content inside the form's own white card (`panelClass` is spacing and
   * nothing else), and the step header's subline states its facts unboxed too —
   * so a bordered, filled collapsed row was the odd one out in both directions.
   */
  it('draws no border or fill of its own', () => {
    const { container } = renderRow();
    const row = container.firstElementChild!;
    expect(row.className).not.toMatch(/border/);
    expect(row.className).not.toMatch(/bg-/);
  });

  /**
   * When a row does not fit, wrapping is the better failure than clipping, for a
   * row whose whole job is to state a fact — a truncating value drops its LAST
   * segment, which is the one a customer is least able to recover from the rest
   * of the screen.
   *
   * The pill is pushed by an auto margin rather than by `justify-between`,
   * because auto margins resolve per flex line: it stays against the right edge
   * whether it shares a line or has one to itself. These rows are `lg:hidden`,
   * so that edge is always a phone's. Class assertions rather than
   * measurements, since JSDOM does no layout.
   */
  it('wraps rather than truncating, and keeps the pill right on either line', () => {
    const { container } = renderRow();

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
