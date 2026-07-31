/**
 * The "What are you booking?" fork in booking step 3.
 *
 * A Play & Food set is a pricing MODE, not an add-on: selecting one calls
 * `setDuration(pkg.duration)` and the duration ladder disappears entirely. The
 * fork makes that explicit, and the set cards exist so the duration rewrite is
 * disclosed on the card the customer taps rather than happening silently.
 *
 * These tests pin the behaviours that must not regress:
 *   - Bay only shows the duration ladder; Bay + food does not.
 *   - Selecting a set still fixes the duration at the set's own length.
 *   - A `?package=SET_B` deep link opens ON the Bay + food fork with SET B
 *     selected, not on Bay only with a package quietly selected underneath.
 *   - Clearing back to Bay only resets duration and party size as before.
 *   - The per-person lead figure follows the selected party size.
 *   - The bay/food price split is generated per slot, so morning and evening
 *     differ, and it sums to the total it sits under.
 *   - The bay arrives already chosen and is only REPORTED here, never asked
 *     again — including the "All Bays" case, which names itself rather than
 *     silently reading as Social.
 *   - The bay is neither asked for NOR restated here. The step header's subline
 *     is the one place the flow states the slot, and it carries the way back to
 *     the step that owns it; this component must stay silent about it.
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { BayType } from '@/lib/bayConfig';
import { SessionStep } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/SessionStep';
import { formatShortDate } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/summarySubline';
import { SetMenuCard } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/SetMenuCard';
import { getPlayFoodPackages, type PlayFoodPackage } from '@/types/play-food-packages';
import messages from '@/messages/en.json';

const PACKAGES = getPlayFoodPackages();
const SET_A = PACKAGES.find((p) => p.id === 'SET_A')!;
const SET_B = PACKAGES.find((p) => p.id === 'SET_B')!;
const SET_C = PACKAGES.find((p) => p.id === 'SET_C')!;

/** Wednesday 15 Jul 2026 — weekday rates: ฿550 before 14:00, ฿750 after 17:00. */
const WEEKDAY = new Date('2026-07-15T00:00:00');

interface HarnessOverrides {
  initialPackage?: PlayFoodPackage | null;
  initialDuration?: number;
  initialPeople?: number;
  selectedTime?: string;
  maxDuration?: number;
  onDurationChange?: (value: number) => void;
  onPeopleChange?: (value: number) => void;
  onPackageChange?: (value: PlayFoodPackage | null) => void;
  routerReplace?: (href: string, options?: { scroll?: boolean }) => void;
  /** The bay chosen on step 2. `null` is "All Bays" — no preference. */
  bayType?: BayType | null;
  /** Unlocks the 4 h and 5 h rungs — the 7-tile ladder, the widest layout. */
  hasActivePackage?: boolean;
  /** The flow's `handleBack`: out of step 3, to the step that owns the slot. */
  onBack?: () => void;
  /** The sets on offer. Overridden only to simulate a future set list, e.g.
      one whose drinks allowance differs from the three we ship today. */
  packages?: PlayFoodPackage[];
}

/** What `BookingDetails` resolves for each bay state, so the harness agrees with it. */
const BAY_LABEL: Record<'social' | 'ai_lab' | 'any', string> = {
  social: messages.bookings.detailsStep.socialBay,
  ai_lab: messages.bookings.detailsStep.aiLab,
  any: messages.bookings.detailsStep.anyBay,
};

/**
 * Stateful wrapper: the real parent owns duration / people / package state, so
 * a test that clicks a set card needs the selection to actually stick before it
 * can assert on the resulting render. Spies are layered on top of the setters.
 */
function Harness({
  initialPackage = null,
  initialDuration = 1,
  initialPeople = 1,
  selectedTime = '19:00',
  maxDuration = 3,
  onDurationChange,
  onPeopleChange,
  onPackageChange,
  routerReplace = () => {},
  bayType = 'social',
  hasActivePackage = false,
  onBack = () => {},
  packages = PACKAGES,
}: HarnessOverrides) {
  const [duration, setDuration] = useState(initialDuration);
  const [numberOfPeople, setNumberOfPeople] = useState(initialPeople);
  const [pkg, setPkg] = useState<PlayFoodPackage | null>(initialPackage);

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionStep
        maxDuration={maxDuration}
        duration={duration}
        setDuration={(v) => {
          onDurationChange?.(v);
          setDuration(v);
        }}
        numberOfPeople={numberOfPeople}
        setNumberOfPeople={(v) => {
          onPeopleChange?.(v);
          setNumberOfPeople(v);
        }}
        localSelectedPackage={pkg}
        setLocalSelectedPackage={(v) => {
          onPackageChange?.(v);
          setPkg(v);
        }}
        PLAY_FOOD_PACKAGES={packages}
        setShowPackageModal={() => {}}
        router={{ replace: routerReplace }}
        durationError=""
        hasActivePackage={hasActivePackage}
        selectedDate={WEEKDAY}
        selectedTime={selectedTime}
        selectedBayType={bayType}
        onBack={onBack}
      />
    </NextIntlClientProvider>
  );
}

const forkButton = (name: 'Bay Only' | 'Bay + Food') =>
  screen.getByRole('button', { name: new RegExp(name.replace('+', '\\+'), 'i') });

/** The duration ladder is the group labelled "Duration (in hours)". */
const durationLadderPresent = () =>
  screen.queryByText(messages.bookings.detailsStep.durationLabel) !== null;

/** Each set card is a button whose accessible name contains the set name. */
const setCard = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const setCardPresent = (name: string) =>
  screen.queryByRole('button', { name: new RegExp(name) }) !== null;

/**
 * The bay is chosen once, on step 2, and this step neither asks for it again nor
 * repeats it.
 *
 * It used to do both, in turn. First a required `Bay Type *` toggle plus an
 * availability line under the duration ladder, which made the customer answer
 * twice. Then, after those went, a "slot chip" that RECAPPED the bay along with
 * the date and the start time — which read as a second answer to a question this
 * screen was no longer asking, and duplicated the step header two rows above it.
 *
 * Both are gone. The header's subline is the single place the flow states the
 * slot, on every screen, and it carries the "Change" that returns to step 2 —
 * see `BookingStepHeader`, where that pairing is tested. What is asserted here
 * is the negative: this component says nothing about the bay at all, so it
 * cannot drift back into disagreeing with the line above it.
 */
describe('the bay is neither asked for nor restated here', () => {
  test.each([
    ['social' as const, BAY_LABEL.social],
    ['ai_lab' as const, BAY_LABEL.ai_lab],
    [null, BAY_LABEL.any],
  ])('a %s choice is not printed on this step (the header owns it)', (bayType, label) => {
    render(<Harness bayType={bayType} />);
    expect(screen.queryByText(new RegExp(label))).not.toBeInTheDocument();
  });

  test('no Social / AI Lab toggle is offered, for any of the three choices', () => {
    for (const bayType of ['social', 'ai_lab', null] as const) {
      const { unmount } = render(<Harness bayType={bayType} />);
      // Nothing on this step sets, names or explains a bay. The AI Lab warning
      // is the one exception and fires on party size, not on the bay control it
      // no longer has — it has its own block below.
      for (const label of Object.values(BAY_LABEL)) {
        expect(screen.queryByRole('button', { name: new RegExp(label) })).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  /**
   * The bay explainer moved out with the chip. It is not orphaned — the date
   * step and the time step each open their own `BayInfoModal`, which is where
   * the bay is actually chosen. A stray "Info" here would be a door to a modal
   * this component no longer renders.
   */
  test('offers no bay-type explainer, which now lives where the bay is chosen', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: messages.bookings.detailsStep.info }),
    ).not.toBeInTheDocument();
  });

  test('no bay-availability line sits under the duration ladder', () => {
    render(<Harness />);
    // "Available for 1 hour: 3 Social Bays only" and its two siblings.
    expect(screen.queryByText(/Available for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Social Bays only/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Bay only/)).not.toBeInTheDocument();
  });

  test('the AI Lab group-size warning still fires, and only for AI Lab', () => {
    const { unmount } = render(<Harness bayType="ai_lab" initialPeople={3} />);
    expect(
      screen.getByText(messages.bookings.detailsStep.aiLabRecommendationTitle),
    ).toBeInTheDocument();
    unmount();

    render(<Harness bayType={null} initialPeople={3} />);
    expect(
      screen.queryByText(messages.bookings.detailsStep.aiLabRecommendationTitle),
    ).not.toBeInTheDocument();
  });
});

describe('the fork opens on Bay only by default', () => {
  test('the duration ladder is shown and no set cards are rendered', () => {
    render(<Harness />);
    expect(durationLadderPresent()).toBe(true);
    expect(setCardPresent('SET A')).toBe(false);
    expect(setCardPresent('SET B')).toBe(false);
    expect(setCardPresent('SET C')).toBe(false);
  });

  test('Bay only is the pressed side of the segmented control', () => {
    render(<Harness />);
    expect(forkButton('Bay Only')).toHaveAttribute('aria-pressed', 'true');
    expect(forkButton('Bay + Food')).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * The hint on the Bay + Food tile: one quiet line giving a reason to open the
 * fork, rather than a tile that only names itself.
 *
 * It states an inclusion, not a saving, and that is a data conclusion rather
 * than a design preference — see the block comment on
 * `everySetIncludesUnlimitedDrinks`. What these pin is that it stays a hint:
 * on the tile it argues for, computed from the sets behind it, and quiet
 * enough not to outweigh the thing it is pointing at.
 */
describe('the Bay + Food tile carries a hint', () => {
  const HINT = messages.bookings.detailsStep.bayPlusFoodDrinksHint;

  test('names what the sets include, on the tile that leads to them', () => {
    render(<Harness />);

    expect(within(forkButton('Bay + Food')).getByText(HINT)).toBeInTheDocument();
  });

  /**
   * It has to be readable BEFORE the fork is opened — that is the whole job.
   * A hint that only appears once the customer has already committed to
   * looking is not a reason to look.
   */
  test('is visible while Bay only is still the selected side', () => {
    render(<Harness />);

    expect(forkButton('Bay Only')).toHaveAttribute('aria-pressed', 'true');
    expect(within(forkButton('Bay + Food')).getByText(HINT)).toBeInTheDocument();
  });

  test('does not appear on the Bay only tile', () => {
    render(<Harness />);

    expect(within(forkButton('Bay Only')).queryByText(HINT)).toBeNull();
    // ...and it is the food tile's own line, not loose in the fork block.
    expect(screen.getAllByText(HINT)).toHaveLength(1);
  });

  /**
   * Subtle means subtle: no tinted panel and no accent of its own. The tile's
   * selected state is already green, so a second status colour inside it would
   * compete with the only signal that matters there.
   */
  test('is a quiet line, not a coloured callout', () => {
    render(<Harness />);

    const hint = within(forkButton('Bay + Food')).getByText(HINT);
    expect(hint.className).not.toMatch(/amber|green|blue|bg-/);
    expect(hint.className).not.toMatch(/rounded|border/);
    expect(hint.className).toMatch(/opacity-75/);
    expect(forkButton('Bay + Food').querySelector('.bg-amber-50')).toBeNull();
  });

  /**
   * The extra line must not make one tile taller than the other. Both are grid
   * items with a min height rather than a fixed one, so the row stretches them
   * together and the denser tile cannot outgrow its neighbour.
   */
  test('does not unbalance the two tiles', () => {
    render(<Harness />);

    for (const side of ['Bay Only', 'Bay + Food'] as const) {
      expect(forkButton(side).className).toContain('min-h-[4rem]');
      // A fixed height would clip the third line instead of accommodating it.
      expect(forkButton(side).className).not.toMatch(/(^|\s)h-16(\s|$)/);
    }
  });

  /**
   * Read off the package data, so a set that stopped including the allowance
   * takes the claim down with it rather than leaving the tile advertising it.
   */
  test('goes silent when a set stops including unlimited drinks', () => {
    const [a, b, c] = PACKAGES;
    render(<Harness packages={[a, { ...b, drinks: [] }, c]} />);

    expect(screen.queryByText(HINT)).toBeNull();
    // The tile itself is untouched; only the hint line is withdrawn.
    expect(
      within(forkButton('Bay + Food')).getByText(
        messages.bookings.detailsStep.bayPlusFoodDescription,
      ),
    ).toBeInTheDocument();
  });
});

describe('switching to Bay + food', () => {
  test('shows all three set cards and hides the duration ladder', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    expect(setCardPresent('SET A')).toBe(true);
    expect(setCardPresent('SET B')).toBe(true);
    expect(setCardPresent('SET C')).toBe(true);
    expect(durationLadderPresent()).toBe(false);
  });

  test('warns that nothing is selected yet, so pricing is still bay only', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    expect(screen.getByText(messages.bookings.detailsStep.setPickPrompt)).toBeInTheDocument();
  });

  test('selecting a set fixes the duration at the set length and clears the prompt', async () => {
    const user = userEvent.setup();
    const onDurationChange = jest.fn();
    const routerReplace = jest.fn();
    render(<Harness onDurationChange={onDurationChange} routerReplace={routerReplace} />);

    await user.click(forkButton('Bay + Food'));
    await user.click(setCard('SET C'));

    expect(onDurationChange).toHaveBeenCalledWith(SET_C.duration);
    expect(routerReplace).toHaveBeenCalledWith('/bookings?package=SET_C', { scroll: false });
    expect(durationLadderPresent()).toBe(false);
    expect(screen.queryByText(messages.bookings.detailsStep.setPickPrompt)).toBeNull();
    expect(within(setCard('SET C')).getByText('Selected')).toBeInTheDocument();
  });

  test('a set longer than the slot headroom is rendered but not selectable', async () => {
    const user = userEvent.setup();
    const onPackageChange = jest.fn();
    // A 1.5h slot fits SET A (1h) but neither SET B (2h) nor SET C (3h).
    render(<Harness maxDuration={1.5} onPackageChange={onPackageChange} />);
    await user.click(forkButton('Bay + Food'));

    expect(setCard('SET A')).toBeEnabled();
    expect(setCard('SET B')).toBeDisabled();
    expect(setCard('SET C')).toBeDisabled();
    expect(within(setCard('SET C')).getByText('Not Available')).toBeInTheDocument();

    await user.click(setCard('SET C'));
    expect(onPackageChange).not.toHaveBeenCalled();
  });
});

describe('the ?package= deep link', () => {
  test('opens on the Bay + food fork with that set selected and no ladder', () => {
    render(<Harness initialPackage={SET_B} initialDuration={SET_B.duration} />);

    expect(forkButton('Bay + Food')).toHaveAttribute('aria-pressed', 'true');
    expect(forkButton('Bay Only')).toHaveAttribute('aria-pressed', 'false');
    expect(durationLadderPresent()).toBe(false);
    expect(within(setCard('SET B')).getByText('Selected')).toBeInTheDocument();
    // No "pick a set" nag when one is already selected.
    expect(screen.queryByText(messages.bookings.detailsStep.setPickPrompt)).toBeNull();
  });
});

describe('clearing back to Bay only', () => {
  test('resets duration to 1, party to 1, clears the package and drops the param', async () => {
    const user = userEvent.setup();
    const onDurationChange = jest.fn();
    const onPeopleChange = jest.fn();
    const onPackageChange = jest.fn();
    const routerReplace = jest.fn();
    render(
      <Harness
        initialPackage={SET_C}
        initialDuration={SET_C.duration}
        initialPeople={4}
        onDurationChange={onDurationChange}
        onPeopleChange={onPeopleChange}
        onPackageChange={onPackageChange}
        routerReplace={routerReplace}
      />,
    );

    await user.click(forkButton('Bay Only'));

    expect(onPackageChange).toHaveBeenCalledWith(null);
    expect(onDurationChange).toHaveBeenCalledWith(1);
    expect(onPeopleChange).toHaveBeenCalledWith(1);
    expect(routerReplace).toHaveBeenCalledWith('/bookings', { scroll: false });
    expect(durationLadderPresent()).toBe(true);
    expect(setCardPresent('SET B')).toBe(false);
  });
});

describe('the card figures come from the live booking, not the static data', () => {
  /**
   * The card leads with the set TOTAL, and the per-head split rides along it as
   * a qualifier. The split is still computed from the SELECTED party — the
   * bait-and-switch this whole module exists to prevent is showing the ฿420
   * five-head figure from `pricePerPerson` to a party of two.
   */
  test('the headline is the total, qualified by the split across the selected party', async () => {
    const user = userEvent.setup();
    render(<Harness initialPeople={2} />);
    await user.click(forkButton('Bay + Food'));

    const card = setCard('SET B');
    expect(within(card).getByText(`฿${SET_B.price.toLocaleString()}`)).toBeInTheDocument();
    expect(within(card).getByText('฿1,050 each for 2 people')).toBeInTheDocument();
    // Not the ฿420 five-head figure the package data carries.
    expect(within(card).queryByText(/฿420/)).toBeNull();
  });

  /**
   * The owner's report, as a rendering test: at a party of one the card printed
   * ฿1,200 twice ("฿1,200 each at 1 person" and "Total ฿1,200 NET"), plus a
   * capacity figure for a party they had not chosen, plus the split. Four money
   * statements for one price. Two survive, and neither repeats the other.
   */
  test('a party of one sees the price once, and exactly two money lines', async () => {
    const user = userEvent.setup();
    render(<Harness initialPeople={1} selectedTime="10:00" />);
    await user.click(forkButton('Bay + Food'));

    const card = setCard('SET A');
    // The total, once.
    expect(within(card).getAllByText(`฿${SET_A.price.toLocaleString()}`)).toHaveLength(1);
    // No per-head qualifier: at a party of one it is the same number again.
    expect(within(card).queryByText(/each for/)).toBeNull();
    // No "Total" label, and no capacity line for a party size not selected.
    expect(within(card).queryByText(/Total/)).toBeNull();
    expect(within(card).queryByText(/at 5 people/)).toBeNull();
    // What remains: the headline, its NET marker, and the bay/food split.
    expect(within(card).getByText('NET')).toBeInTheDocument();
    expect(
      within(card).getByText('฿550 bay time + ฿650 food and drinks'),
    ).toBeInTheDocument();
  });

  test('the duration is printed on the card, because selecting it rewrites the booking', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    expect(within(setCard('SET A')).getByText('1 hour')).toBeInTheDocument();
    expect(within(setCard('SET B')).getByText('2 hours')).toBeInTheDocument();
    expect(within(setCard('SET C')).getByText('3 hours')).toBeInTheDocument();
  });

  test('the price split differs between a morning and an evening slot', async () => {
    const user = userEvent.setup();

    const { unmount } = render(<Harness selectedTime="10:00" />);
    await user.click(forkButton('Bay + Food'));
    // 2h weekday morning bay = 2 × ฿550 = ฿1,100, so SET B's food adds ฿1,000.
    expect(
      within(setCard('SET B')).getByText('฿1,100 bay time + ฿1,000 food and drinks'),
    ).toBeInTheDocument();
    unmount();

    render(<Harness selectedTime="19:00" />);
    await user.click(forkButton('Bay + Food'));
    // 2h weekday evening bay = 2 × ฿750 = ฿1,500, so the premium is ฿600.
    expect(
      within(setCard('SET B')).getByText('฿1,500 bay time + ฿600 food and drinks'),
    ).toBeInTheDocument();
  });

  /**
   * The split replaced an amber panel that argued for the set below the includes
   * list. As a subordinate line under the total it has to actually add up to
   * that total, which is what makes it a decomposition rather than a fourth
   * claim — and is the reason it can sit there quietly at all.
   */
  test('the split adds up to the total printed directly above it', async () => {
    const user = userEvent.setup();
    render(<Harness selectedTime="10:00" />);
    await user.click(forkButton('Bay + Food'));

    const card = within(setCard('SET B'));
    expect(card.getByText(`฿${SET_B.price.toLocaleString()}`)).toBeInTheDocument();
    // ฿1,100 + ฿1,000 = SET B's ฿2,100 total.
    expect(1100 + 1000).toBe(SET_B.price);
    expect(card.getByText('฿1,100 bay time + ฿1,000 food and drinks')).toBeInTheDocument();
  });

  test('the split is a quiet line, not the amber callout it replaced', async () => {
    const user = userEvent.setup();
    render(<Harness selectedTime="10:00" />);
    await user.click(forkButton('Bay + Food'));

    const split = within(setCard('SET B')).getByText('฿1,100 bay time + ฿1,000 food and drinks');
    // No boxed panel and no accent colour competing with the price above it.
    expect(split.className).not.toMatch(/amber/);
    expect(split.className).not.toMatch(/rounded/);
    expect(split.className).toContain('text-xs');
    expect(setCard('SET B').querySelector('.bg-amber-50')).toBeNull();
  });

  test('every set itemises its food and drinks with the unlimited distinction kept', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    const cardA = setCard('SET A');
    expect(within(cardA).getByText(`• 1 Serving of ${SET_A.foodItems[0].name}`)).toBeInTheDocument();
    expect(within(cardA).getByText('• Unlimited Soft Drinks')).toBeInTheDocument();

    // SET C is the only set with a per-person drink allowance.
    const cardC = setCard('SET C');
    expect(within(cardC).getByText('• Unlimited Soft Drinks')).toBeInTheDocument();
    expect(
      within(cardC).getByText('• 1x Beer / Cocktail / Wine per person'),
    ).toBeInTheDocument();
  });

  test('the popular set carries the ribbon and the others do not', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    expect(within(setCard('SET B')).getByText('Most Popular')).toBeInTheDocument();
    expect(within(setCard('SET A')).queryByText('Most Popular')).toBeNull();
    expect(within(setCard('SET C')).queryByText('Most Popular')).toBeNull();
  });

  /**
   * The slot held a "Photo coming soon" placeholder on every card until the set
   * photography landed. Now each card resolves its own photo from `pkg.id`, so
   * the assertion inverts: every set is shot, and none of them still shows the
   * placeholder.
   */
  test('every set renders its own photo in the image slot', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    for (const pkg of PACKAGES) {
      const photo = within(setCard(pkg.name)).getByRole('img', { name: pkg.name });
      // next/image rewrites src through the optimizer, so assert on the
      // original path it carries rather than on the rendered attribute.
      expect(decodeURIComponent(photo.getAttribute('src') ?? '')).toContain(
        `/images/play-food/${pkg.id.toLowerCase().replace('_', '-')}.jpg`,
      );
    }

    expect(screen.queryByText('Photo coming soon')).toBeNull();
  });
});

/**
 * The image slot's two fallbacks, exercised on the card directly because
 * `SessionStep` only ever renders the three shot sets.
 */
describe('the set card image slot', () => {
  const renderCard = (props: Partial<React.ComponentProps<typeof SetMenuCard>> = {}) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SetMenuCard
          pkg={SET_A}
          isSelected={false}
          isAvailable
          onSelect={() => {}}
          numberOfPeople={2}
          date="2026-07-15"
          startTime="19:00"
          {...props}
        />
      </NextIntlClientProvider>,
    );

  test('an explicit imageSrc overrides the photo the set id would pick', () => {
    renderCard({ imageSrc: '/images/play-food/campaign.jpg' });

    const photo = screen.getByRole('img', { name: SET_A.name });
    expect(decodeURIComponent(photo.getAttribute('src') ?? '')).toContain('campaign.jpg');
    expect(decodeURIComponent(photo.getAttribute('src') ?? '')).not.toContain('set-a.jpg');
  });

  /**
   * The regression this guards: a fourth set added to the package data before
   * its shoot lands must fall back to the placeholder, not render a broken
   * image. `SET_IMAGES` is `Partial` for exactly this reason, so the cast below
   * is simulating a real future state rather than an impossible one.
   */
  test('a set with no photo falls back to the placeholder', () => {
    renderCard({ pkg: { ...SET_A, id: 'SET_D' as PlayFoodPackage['id'], name: 'SET D' } });

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Photo coming soon')).toBeInTheDocument();
  });
});

describe('the people picker', () => {
  test('reads the cap off the selected set rather than hardcoding five', async () => {
    const user = userEvent.setup();
    render(<Harness initialPackage={SET_B} />);

    // Every set is maxPeople: 5 today, so this is the same five tiles as before.
    expect(SET_B.maxPeople).toBe(5);
    const people = screen.getByText(messages.bookings.detailsStep.numberOfPeople)
      .parentElement as HTMLElement;
    for (const n of ['1', '2', '3', '4', '5']) {
      expect(within(people).getByRole('button', { name: n })).toBeInTheDocument();
    }
    expect(within(people).queryByRole('button', { name: '6' })).toBeNull();

    await user.click(within(people).getByRole('button', { name: '3' }));
    // The headline total does not move with the party; the qualifier does.
    expect(within(setCard('SET B')).getByText('฿2,100')).toBeInTheDocument();
    expect(within(setCard('SET B')).getByText('฿700 each for 3 people')).toBeInTheDocument();
  });

  /**
   * The party-size tokens carry their selection as a solid fill rather than the
   * old pale tint, which means the selected one is no longer distinguishable in
   * the accessibility tree by anything the DOM exposes unless it says so. Both
   * pickers therefore report `aria-pressed`, and exactly one token is pressed.
   */
  test('marks exactly one party size as pressed, and moves it on click', async () => {
    const user = userEvent.setup();
    render(<Harness initialPeople={2} />);

    const people = screen.getByText(messages.bookings.detailsStep.numberOfPeople)
      .parentElement as HTMLElement;

    expect(within(people).getByRole('button', { pressed: true })).toHaveAccessibleName('2');

    await user.click(within(people).getByRole('button', { name: '4' }));
    expect(within(people).getByRole('button', { pressed: true })).toHaveAccessibleName('4');
  });
});

describe('the duration ladder', () => {
  const ladder = () =>
    screen.getByText(messages.bookings.detailsStep.durationLabel).parentElement as HTMLElement;

  test('marks exactly one rung as pressed, and moves it on click', async () => {
    const user = userEvent.setup();
    render(<Harness initialDuration={1} />);

    expect(within(ladder()).getByRole('button', { pressed: true })).toHaveAccessibleName('1');

    // 1.5 is unique to the ladder — the party-size tokens are whole numbers.
    await user.click(within(ladder()).getByRole('button', { name: '1.5' }));
    expect(within(ladder()).getByRole('button', { pressed: true })).toHaveAccessibleName('1.5');
  });

  /**
   * The half-hour rungs are the reason the ladder exists in this shape
   * (owner-confirmed 25 Jul 2026); a redesign that quietly rounded them away
   * would be a pricing change wearing a visual change's clothes.
   */
  test('still offers the half-hour rungs, capped by the slot headroom', () => {
    render(<Harness maxDuration={3} />);

    for (const rung of ['1', '1.5', '2', '2.5', '3']) {
      expect(within(ladder()).getByRole('button', { name: rung })).toBeInTheDocument();
    }
    // 4 and 5 stay behind `hasActivePackage`, which the harness leaves false.
    expect(within(ladder()).queryByRole('button', { name: '4' })).toBeNull();
    expect(within(ladder()).queryByRole('button', { name: '5' })).toBeNull();
  });
});

/**
 * Duration and party size used to be drawn as two different controls on
 * purpose — a recessed segmented track for the scale, detached round tokens for
 * the count — so that shape would carry the distinction before either label was
 * read. Sitting about 40px apart it read as inconsistency instead, which is
 * what the owner reported on the QA build.
 *
 * They are one component now (`SegmentedOptions`). These pin the properties
 * that made merging them safe, so a future change to one picker cannot quietly
 * reintroduce a second idiom or shrink a tile under the touch target.
 */
describe('the two pickers share one idiom', () => {
  const block = (label: string) => screen.getByText(label).parentElement as HTMLElement;
  const durationBlock = () => block(messages.bookings.detailsStep.durationLabel);
  const peopleBlock = () => block(messages.bookings.detailsStep.numberOfPeople);

  test('both render the same control, styled identically at the same rung count', () => {
    // Five duration rungs against five party sizes, so any class difference is
    // a difference of idiom rather than of column count.
    render(<Harness maxDuration={3} initialDuration={1} initialPeople={1} />);

    const durationRail = within(durationBlock()).getByRole('group');
    const peopleRail = within(peopleBlock()).getByRole('group');
    expect(durationRail.className).toBe(peopleRail.className);

    const pressed = (rail: HTMLElement) => within(rail).getByRole('button', { pressed: true });
    const unpressed = (rail: HTMLElement) =>
      within(rail).getAllByRole('button', { pressed: false })[0];

    expect(pressed(durationRail).className).toBe(pressed(peopleRail).className);
    expect(unpressed(durationRail).className).toBe(unpressed(peopleRail).className);

    // The old party-size idiom, gone: no round detached tokens anywhere.
    expect(peopleRail.querySelector('.rounded-full')).toBeNull();
  });

  test('each picker is a labelled group, so the buttons are not loose in the form', () => {
    render(<Harness maxDuration={3} />);

    for (const [blockOf, label] of [
      [durationBlock, messages.bookings.detailsStep.durationLabel],
      [peopleBlock, messages.bookings.detailsStep.numberOfPeople],
    ] as const) {
      const rail = within(blockOf()).getByRole('group');
      expect(rail).toHaveAccessibleName(label);
    }
  });

  /**
   * The widest case, and the reason the rail wraps rather than adding columns:
   * a package holder's seven rungs across a 360px viewport would be ~42px per
   * tile at seven columns, under the 44px minimum. Four columns lays them out
   * as 4 + 3 at ~71px.
   */
  test('seven duration rungs wrap to four columns instead of shrinking', () => {
    const { unmount } = render(<Harness maxDuration={5} hasActivePackage />);

    const sevenRail = within(durationBlock()).getByRole('group');
    expect(within(sevenRail).getAllByRole('button')).toHaveLength(7);
    expect(sevenRail.className).toContain('grid-cols-4');
    expect(sevenRail.className).not.toContain('grid-cols-7');
    unmount();

    // The common case still fills a single five-across row exactly.
    render(<Harness maxDuration={3} />);
    const fiveRail = within(durationBlock()).getByRole('group');
    expect(within(fiveRail).getAllByRole('button')).toHaveLength(5);
    expect(fiveRail.className).toContain('grid-cols-5');
  });

  /**
   * The column count is read off the option count, so a set with a capacity
   * other than five shortens the rail rather than leaving empty columns. No
   * literal here has to be kept in step with `maxPeople`.
   */
  test('a smaller seat cap gives a shorter rail, not empty columns', () => {
    // `PlayFoodPackage['maxPeople']` is the literal 5 today, so the cast
    // simulates a real future state rather than an impossible one — same
    // reason as the SET_D placeholder case above.
    const cappedAtThree = { ...SET_B, maxPeople: 3 } as unknown as PlayFoodPackage;
    render(<Harness initialPackage={cappedAtThree} />);

    const rail = within(peopleBlock()).getByRole('group');
    expect(within(rail).getAllByRole('button')).toHaveLength(3);
    expect(rail.className).toContain('grid-cols-3');
  });
});

/**
 * Party size sits near the top of the sub-step, with the date/time/bay facts,
 * rather than at the very bottom where it started. Owner asked for it to move
 * up and the ordering turns out to be load-bearing rather than cosmetic, so it
 * is pinned here.
 *
 * The binding reason is the per-head price. Every set card renders "฿X each for
 * N people" off `numberOfPeople`, so with the picker last the customer read a
 * per-head figure derived from a party size they had not chosen yet and only
 * met the control after scrolling past the numbers it explained. The AI Lab
 * callout has the same shape of problem: it fires on `numberOfPeople >= 3` and
 * used to sit a screen above its own cause.
 */
describe('party size comes before what it prices', () => {
  /** True when `first` precedes `second` in document order. */
  const precedes = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  const peopleLabel = () => screen.getByText(messages.bookings.detailsStep.numberOfPeople);

  test('is asked before the booking-mode fork and the duration ladder', () => {
    render(<Harness maxDuration={3} />);

    expect(
      precedes(peopleLabel(), screen.getByText(messages.bookings.detailsStep.bookingModeLabel)),
    ).toBe(true);
    expect(
      precedes(peopleLabel(), screen.getByText(messages.bookings.detailsStep.durationLabel)),
    ).toBe(true);
  });

  test('is asked before the set cards that price per head', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(forkButton('Bay + Food'));

    expect(precedes(peopleLabel(), setCard('SET A'))).toBe(true);
  });

  /**
   * Cause above effect: the callout must appear beneath the control that
   * triggers it, not above it.
   */
  test('is asked before the AI Lab group-size warning it triggers', () => {
    render(<Harness bayType="ai_lab" initialPeople={3} />);

    const warning = screen.getByText(messages.bookings.detailsStep.aiLabRecommendationTitle);
    expect(precedes(peopleLabel(), warning)).toBe(true);
  });
});
