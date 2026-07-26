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
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { BayType } from '@/lib/bayConfig';
import { SessionStep } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/SessionStep';
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
        PLAY_FOOD_PACKAGES={PACKAGES}
        setShowPackageModal={() => {}}
        router={{ replace: routerReplace }}
        durationError=""
        hasActivePackage={false}
        selectedDate={WEEKDAY}
        selectedTime={selectedTime}
        selectedBayType={bayType}
        bayLabel={BAY_LABEL[bayType ?? 'any']}
        setShowBayInfoModal={() => {}}
        formatDate={(d) => d.toDateString()}
        onBack={() => {}}
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
 * The bay is chosen once, on step 2. This step used to ask a second time — a
 * required `Bay Type *` toggle plus an availability line under the duration
 * ladder feeding it — which is what made the customer answer twice.
 */
describe('the bay is reported, not asked again', () => {
  const bayCard = () => screen.getByTestId('booking-bay-card');

  test.each([
    ['social' as const, BAY_LABEL.social],
    ['ai_lab' as const, BAY_LABEL.ai_lab],
    [null, BAY_LABEL.any],
  ])('a %s choice is stated as "%s"', (bayType, label) => {
    render(<Harness bayType={bayType} />);
    expect(within(bayCard()).getByText(label)).toBeInTheDocument();
  });

  test('no Social / AI Lab toggle is offered, for any of the three choices', () => {
    for (const bayType of ['social', 'ai_lab', null] as const) {
      const { unmount } = render(<Harness bayType={bayType} />);
      // The only control on the card is the info link that opens the modal.
      const buttons = within(bayCard()).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([messages.bookings.detailsStep.info]);
      unmount();
    }
  });

  test('the bay is not marked required — "All Bays" is a complete answer', () => {
    render(<Harness bayType={null} />);
    expect(within(bayCard()).queryByText('*')).not.toBeInTheDocument();
  });

  /**
   * The card branched on `=== 'ai_lab'` only, so "All Bays" fell into the Social
   * branch and rendered the same green `UsersIcon` and the same
   * `text-green-700` — pixel-identical to a Social Bay card with only the word
   * differing. The label is the part of a card a customer scanning it reads
   * last, so the meaning was carried by the one thing they were least likely to
   * look at.
   *
   * Asserting the three differ from each other rather than pinning specific
   * Tailwind tokens: the requirement is that no two answers look alike, and a
   * palette change should not have to update this test to keep meaning it.
   */
  test('the three choices are told apart without reading the label', () => {
    const classesFor = (bayType: BayType | null) => {
      const { unmount } = render(<Harness bayType={bayType} />);
      const card = bayCard();
      const label = within(card).getByText(
        BAY_LABEL[bayType === null ? 'any' : bayType],
      );
      // The icon's own wrapper carries the tint; the label carries the ink.
      const iconWrap = card.querySelector('svg')?.parentElement;
      const signature = `${label.className}|${iconWrap?.className ?? ''}`;
      unmount();
      return signature;
    };

    const social = classesFor('social');
    const aiLab = classesFor('ai_lab');
    const any = classesFor(null);

    expect(any).not.toBe(social);
    expect(any).not.toBe(aiLab);
    expect(social).not.toBe(aiLab);
    // Specifically: no preference must not borrow Social Bay's green.
    expect(any).not.toContain('green');
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
  test('the lead per-person price uses the selected party, with capacity as the curve', async () => {
    const user = userEvent.setup();
    render(<Harness initialPeople={2} />);
    await user.click(forkButton('Bay + Food'));

    const card = setCard('SET B');
    // ฿2,100 across two heads — not the ฿420 five-head figure in the data.
    expect(within(card).getByText('฿1,050')).toBeInTheDocument();
    expect(within(card).getByText(/each at 2 people/)).toBeInTheDocument();
    // The capacity figure is disclosed as the upsell rather than as the price.
    expect(within(card).getByText('฿420 each at 5 people')).toBeInTheDocument();
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
    expect(card.getByText(`Total ฿${SET_B.price.toLocaleString()} NET`)).toBeInTheDocument();
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
    expect(within(setCard('SET B')).getByText('฿700')).toBeInTheDocument();
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
