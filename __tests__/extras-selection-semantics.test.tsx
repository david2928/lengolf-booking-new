/**
 * Booking step 3's Extras panel holds two adjacent selection groups whose
 * models genuinely differ, and the semantics must say so.
 *
 *   club rental → pick ONE (a set, or none)   → radios, one group
 *   Gear Up     → pick ANY (independent)      → checkboxes
 *
 * What was there before lied in both directions. The club sets were plain
 * `<button>`s with no ARIA state at all, so assistive tech was told nothing
 * about what was chosen and nothing about the options being exclusive. The Gear
 * Up row was a `<button aria-pressed>` wrapping a `<div>` drawn to look like a
 * checkbox, so the screen said "checkbox" while the a11y tree said "toggle
 * button". Sighted customers got a weaker version of the same problem: the club
 * rows signalled single-select only by NOT having the tick box the row beneath
 * them had.
 *
 * These tests assert the ROLES, because the role is the contract. Styling is
 * free to change.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useFormatter } from 'next-intl';
import {
  ExtrasStep,
  type ExtrasStepProps,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/ExtrasStep';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';
import messages from '@/messages/en.json';

/**
 * Two real premium sets, so the group under test is the DB-driven path rather
 * than the static fallback. Only the fields this component reads are set; the
 * cast keeps the fixture to the point.
 */
function clubSet(
  over: Partial<RentalClubSetWithAvailability> & { id: string },
): RentalClubSetWithAvailability {
  return {
    tier: 'premium',
    gender: 'mens',
    brand: 'Callaway',
    model: 'Warbird',
    available_count: 2,
    indoor_price_1h: 150,
    indoor_price_2h: 250,
    indoor_price_3h: 350,
    indoor_price_4h: 450,
    indoor_price_5h: 550,
    ...over,
  } as unknown as RentalClubSetWithAvailability;
}

const SETS = [
  clubSet({ id: 'set-mens', gender: 'mens' }),
  clubSet({ id: 'set-womens', gender: 'womens' }),
];

const baseProps: Omit<ExtrasStepProps, 'formatter'> = {
  selectedClubRental: 'standard',
  onClubRentalChange: () => {},
  selectedClubSetId: null,
  onClubSetIdChange: () => {},
  setShowClubRentalModal: () => {},
  clubSetsLoading: false,
  availableClubSets: SETS,
  duration: 1,
  selectedAddOns: {},
  onAddOnsChange: () => {},
};

/** `formatter` comes from the intl context, so it has to be read inside it. */
function Harness(overrides: Partial<ExtrasStepProps>) {
  const formatter = useFormatter();
  return <ExtrasStep {...baseProps} formatter={formatter} {...overrides} />;
}

function renderStep(overrides: Partial<ExtrasStepProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages as never}>
      <Harness {...overrides} />
    </NextIntlClientProvider>,
  );
}

describe('club rental is a single-select radio group', () => {
  it('exposes every option as a radio', () => {
    renderStep();

    // No Rental, Standard, and the two DB sets.
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  /**
   * The reason radios were chosen over `role="radiogroup"` + hand-rolled
   * roving tabindex: the options live in separate DOM containers (the fixed
   * pair, then the DB-driven list, or the static fallback) and native radios
   * group by `name`, not by nesting. If this ever splits into two names the
   * browser stops enforcing exclusivity and arrow keys stop crossing the
   * boundary, with nothing else on screen to show it.
   */
  it('puts every option in ONE group', () => {
    renderStep();

    const names = new Set(
      screen.getAllByRole('radio').map((el) => (el as HTMLInputElement).name),
    );
    expect(names.size).toBe(1);
  });

  /**
   * The heading used to be a `<label>` with nothing to point at, which named
   * nothing and left the group anonymous. Entering an unlabelled run of radios
   * mid-form gives no clue what is being chosen.
   */
  it('gives the group an accessible name', () => {
    renderStep();

    expect(screen.getByRole('radiogroup')).toHaveAccessibleName(
      messages.bookings.detailsStep.clubRentalLabel,
    );
  });

  it('has exactly one option checked', () => {
    renderStep();

    const checked = screen
      .getAllByRole('radio')
      .filter((el) => (el as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
  });

  it('checks the selected premium set rather than the tier', () => {
    // Both fixtures are tier `premium`; only the set id distinguishes them, so
    // a check driven off the tier would light up both rows.
    renderStep({ selectedClubRental: 'premium', selectedClubSetId: 'set-womens' });

    const checked = screen
      .getAllByRole('radio')
      .filter((el) => (el as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect((checked[0] as HTMLInputElement).value).toBe('set-womens');
  });

  it('disables a set with no stock instead of hiding it', () => {
    renderStep({
      availableClubSets: [SETS[0], clubSet({ id: 'set-gone', gender: 'womens', available_count: 0 })],
    });

    const soldOut = screen
      .getAllByRole('radio')
      .find((el) => (el as HTMLInputElement).value === 'set-gone');
    expect(soldOut).toBeDisabled();
  });

  it('reports the choice through the tier AND the set id', () => {
    const onClubRentalChange = jest.fn();
    const onClubSetIdChange = jest.fn();
    renderStep({ onClubRentalChange, onClubSetIdChange });

    screen
      .getAllByRole('radio')
      .find((el) => (el as HTMLInputElement).value === 'set-womens')!
      .click();

    expect(onClubRentalChange).toHaveBeenCalledWith('premium');
    expect(onClubSetIdChange).toHaveBeenCalledWith('set-womens');
  });

  it('offers the two tiers as radios when the DB fetch fails', () => {
    renderStep({ availableClubSets: [] });

    // No Rental, Standard, Premium, Premium+ — still one group, still radios.
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(
      new Set(screen.getAllByRole('radio').map((el) => (el as HTMLInputElement).name)).size,
    ).toBe(1);
  });
});

describe('Gear Up is a multi-select', () => {
  it('exposes the add-on as a checkbox, not a radio', () => {
    renderStep();

    const glove = screen.getByRole('checkbox');
    expect(glove).toBeInTheDocument();
    // And it is emphatically not part of the club group.
    expect(screen.getAllByRole('radio')).not.toContain(glove);
  });

  it('reflects the stored add-on state', () => {
    renderStep({ selectedAddOns: { gloves: true } });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('toggles without disturbing the other add-ons', () => {
    const onAddOnsChange = jest.fn();
    renderStep({ selectedAddOns: { balls: true }, onAddOnsChange });

    screen.getByRole('checkbox').click();

    expect(onAddOnsChange).toHaveBeenCalledWith({ balls: true, gloves: true });
  });
});

/**
 * The regression that started this: the two groups were told apart only by the
 * presence of a tick box, which asks the customer to notice something that is
 * NOT there. If the club rows ever gain checkbox semantics again, or Gear Up
 * loses them, this fails.
 */
describe('the two groups stay distinguishable', () => {
  it('never draws the single-select group as checkboxes', () => {
    renderStep();

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1);
  });

  it('leaves no stale aria-pressed toggle behind', () => {
    // Both groups used to be, or sat beside, `aria-pressed` buttons. A leftover
    // one would be a third selection idiom in the same panel.
    const { container } = renderStep();
    expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
  });
});
