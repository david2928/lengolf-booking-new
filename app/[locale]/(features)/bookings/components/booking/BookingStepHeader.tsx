'use client';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { ChangeAnswerButton } from './affordances';
import { BAY_BOOKING_STEP_COUNT, stepBarStates } from './stepHeaderModel';

export interface BookingStepHeaderProps {
  /**
   * 1-based screen the customer is on, in the DEFAULT (narrow) model. Drives
   * which bars are filled. On the booking flow this counts the five screens a
   * phone walks; see `narrowStepFor`.
   */
  currentStep: number;
  /** Small-caps step name on the left of the position row, e.g. "Details". */
  label: string;
  /** Position on the right of that row, e.g. "Step 4 of 5". */
  position: string;
  /**
   * The progress model to show at `lg:` and up instead of the three props
   * above, for a flow whose narrow layout splits a step into several screens.
   * Booking step 3 is the only caller: below `lg:` it is three separate screens
   * (five in the flow), above `lg:` all of them render at once and the flow is
   * genuinely three steps.
   *
   * Supplying `positionWide` is what turns the two-model rendering on; the
   * other two are read alongside it. Omitted everywhere else, and the narrow
   * model then holds at every width.
   *
   * NOT a telemetry boundary. Both models are display only — see the block
   * comment at the top of `stepHeaderModel.ts`.
   */
  positionWide?: string;
  /** The wide model's 1-based step. Defaults to `currentStep`. */
  currentStepWide?: number;
  /** Bars drawn in the wide model. Defaults to `totalSteps`. */
  totalStepsWide?: number;
  /** The large heading: the question being asked right now, e.g. "How long?". */
  question: string;
  /**
   * The heading to show at `lg:` and up instead of `question`, when the wide
   * layout puts more on screen than the narrow one asks about. Booking step 3
   * is the only caller: below `lg:` it asks its current sub-step's question,
   * above `lg:` all three sub-steps render at once and no single sub-step
   * question would be true. Omitted everywhere else, and `question` then holds
   * at every width.
   */
  questionWide?: string;
  /**
   * Accumulated context under the heading, e.g.
   * "Wed 29 Jul, from 13:00, Social Bay". Empty on step 1, where nothing has
   * been chosen; the row is then not rendered at all rather than reserved.
   */
  subline?: string;
  /**
   * Re-opens the step the SUBLINE's facts were decided on. Renders a "Change"
   * pill at the end of the subline row; omit it and the subline is a plain line
   * of text, as it is on steps 1 and 2.
   *
   * WHY THE SUBLINE CARRIES THIS AND NOT A ROW BELOW IT. The subline is already
   * the flow's single home for "what earlier steps settled", on every screen
   * that has one. A recap placed anywhere else necessarily repeats it — which is
   * exactly what the slot chip did, and why a rule existed to silence the
   * subline on the one screen the chip appeared. Putting the affordance ON the
   * line that already states the facts means there is one home, so there is
   * nothing to keep in sync and no duplication to suppress.
   *
   * WHEN TO PASS IT. When the header's own back arrow does NOT reach the step
   * those facts belong to. That is step 3: from its second and third sub-steps
   * `onBack` walks to the previous SUB-step, so the slot is otherwise a dead end
   * needing two guesses to reach. On the first sub-step the two do coincide —
   * accepted, because the back arrow's destination shifts as the customer moves
   * through the sub-steps while this one never does, and a labelled control that
   * always means the same thing is worth more than avoiding an overlap on one
   * screen out of three.
   */
  onChangeSlot?: () => void;
  /** Visible text on that pill, e.g. "Change". Required whenever `onChangeSlot` is passed. */
  changeSlotLabel?: string;
  /**
   * Its accessible name, e.g. "Change time or bay" — longer than the face,
   * because several "Change" controls can share a screen. Must CONTAIN
   * `changeSlotLabel` (WCAG 2.5.3 Label in Name).
   */
  changeSlotAriaLabel?: string;
  /** Backward one level. Omitted on step 1, where there is nowhere to go. */
  onBack?: () => void;
  /** `aria-label` for the back control. Required whenever `onBack` is passed. */
  backLabel: string;
  /** Bars drawn. Defaults to the flow's three; a prop so the suite can vary it. */
  totalSteps?: number;
}

/**
 * The in-flow step header: a segmented progress indicator, a label/position row,
 * the question the customer is being asked, and the booking so far.
 *
 * Four rows in a flow whose first screen is already tight, so each one earns its
 * place by saying something none of the others do:
 *
 * - The BARS are the only at-a-glance read. Nobody parses "Step 2 of 3" while
 *   scrolling; a two-thirds-filled row is understood without reading.
 * - The LABEL/POSITION row is the precise read of the same fact, and the
 *   accessible one (see the a11y note on the bars below).
 * - The QUESTION is what the customer does next. It replaced a generic step name
 *   ("Provide Details") which described the screen rather than asking for
 *   anything, and which a customer already on that screen did not need.
 * - The SUBLINE is what they have chosen so far. It replaced a subtitle that
 *   restated the heading.
 *
 * Presentational on purpose: every string arrives already localised. The
 * decisions about WHICH string — which sub-step's question, whether the bay is a
 * settled choice yet — belong to the flow, and live at the call site in
 * `page.tsx` beside the state they depend on.
 */
/** One row of segmented bars. Presentational; the caller owns `aria-hidden`. */
function BarRow({ bars, className }: { bars: boolean[]; className: string }) {
  return (
    <div className={className}>
      {bars.map((filled, index) => (
        <span
          key={index}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
            filled ? 'bg-green-600' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export function BookingStepHeader({
  currentStep,
  label,
  position,
  positionWide,
  currentStepWide,
  totalStepsWide,
  question,
  questionWide,
  subline,
  onChangeSlot,
  changeSlotLabel,
  changeSlotAriaLabel,
  onBack,
  backLabel,
  totalSteps = BAY_BOOKING_STEP_COUNT,
}: BookingStepHeaderProps) {
  /* Two models are drawn only when the caller supplies a wide POSITION. That
     string is the accessible equivalent of the wide bars, so a wide bar row
     without one would put a fact on screen that no screen reader could reach —
     which is precisely the trade the narrow row is allowed to make only BECAUSE
     its own position row exists. Gating both on the same prop makes the pair
     inseparable. */
  const hasWide = positionWide !== undefined;
  const bars = stepBarStates(currentStep, totalSteps);
  const barsWide = stepBarStates(currentStepWide ?? currentStep, totalStepsWide ?? totalSteps);

  return (
    <header className="mb-5 sm:mb-6">
      {/* The bars carry NO accessible information of their own — `aria-hidden`
          is deliberate, not an omission. The position row below is a real text
          node saying "Step 4 of 5", so a `role="progressbar"` here would make a
          screen reader announce the same fact twice, once in words and once as
          a percentage. Announcing it once, in the words the sighted customer
          also reads, is better than announcing it twice in two vocabularies.

          `flex-1` over a fixed width so the row spans whatever the container
          gives it, and `transition-colors` so advancing a step fills the next
          bar rather than cutting to it.

          Both rows live inside ONE `aria-hidden` wrapper rather than carrying
          the attribute each. That keeps this block a single child of <header>
          however many models are drawn, so the label/position row below stays
          the second — the structure the layout and the suite both read. The
          rows are gated by `hidden`/`lg:hidden` rather than by a viewport
          measurement, so nothing here depends on a client-side match and the
          server and client render the same markup. */}
      <div aria-hidden="true">
        <BarRow
          bars={bars}
          className={`flex items-center gap-1.5 ${hasWide ? 'lg:hidden' : ''}`}
        />
        {hasWide && <BarRow bars={barsWide} className="hidden items-center gap-1.5 lg:flex" />}
      </div>

      {/* Label left, position right, spread to the edges.

          The back control opens this row rather than sitting beside the
          heading, where it used to indent the one line the mockup wants flush
          left. Two things make it free: the negative margins let a 40px tap
          target sit inside a 20px text row without growing it, and `-ml-2.5`
          hangs the button's padding off the content edge so the ARROW itself
          lines up with the heading and subline below.

          `min-w-0 truncate` on the label against `shrink-0` on the position is
          the whole wrapping story at 360px: the position — the accessible
          equivalent of the bars — is the segment that must survive, so the
          label is the one that gives way. Thai is the longest of the five here
          and still fits both on one line; the truncation is the guarantee, not
          the expectation.

          Modest `tracking-wide` rather than the wide tracking a Latin small-caps
          label would take: letter-spacing is applied to Thai and CJK too, where
          generous tracking reads as broken word spacing rather than as
          refinement. `uppercase` is simply inert outside Latin. */}
      <div className="mt-3 flex items-center gap-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-my-2.5 -ml-2.5 shrink-0 rounded-full p-2.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        )}
        <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase leading-5 tracking-wide text-gray-500">
          {label}
        </p>
        {/* Same `hidden`/`lg:hidden` pairing as the heading below, and for the
            same reason: `display: none` drops an element from the accessibility
            tree as well as from the page, so a screen reader is offered exactly
            one position — the one describing the layout it is in — rather than
            two counts of the same flow that disagree with each other. */}
        <p className="shrink-0 text-xs font-semibold uppercase leading-5 tracking-wide text-gray-400 tabular-nums">
          {hasWide ? (
            <>
              <span className="lg:hidden">{position}</span>
              <span className="hidden lg:inline">{positionWide}</span>
            </>
          ) : (
            position
          )}
        </p>
      </div>

      {/* `leading-snug`, not `leading-tight`: Thai stacks tone marks above and
          vowel signs below the baseline, and a 1.25 line box clips them on a
          two-line heading.

          Both headings are in the DOM when `questionWide` is set, gated with
          `hidden`/`lg:hidden` — `display: none` drops an element from the
          accessibility tree as well as from the page, so a screen reader is
          never offered two headings, only the one that matches the layout it is
          describing. */}
      <h2 className="mt-1.5 text-xl font-bold leading-snug text-gray-900 sm:text-2xl">
        {questionWide ? (
          <>
            <span className="lg:hidden">{question}</span>
            <span className="hidden lg:inline">{questionWide}</span>
          </>
        ) : (
          question
        )}
      </h2>

      {/* The subline and, where the flow supplies one, the way back to the step
          it describes.

          `ml-auto lg:ml-0` — right-aligned on a phone, hugging the line on a
          desktop, and the breakpoint is not arbitrary. It is exactly where the
          collapsed sub-step summaries appear and disappear.

          BELOW `lg:` this row sits above `DetailsSubStepSummary` rows carrying
          the same "facts, then a Change pill" shape, so it matches them: pill
          against the right edge. Two rows an inch apart with the pill in
          different places would look like an accident, which is the objection
          that produced this line.

          AT `lg:` AND UP those summaries are `lg:hidden` — step 3 renders whole,
          so nothing is collapsed and there is no second row to match. What there
          IS instead is a content column about 1,200px wide, and `ml-auto` in it
          strands the pill most of a screen away from the sentence it acts on,
          with nothing between them to suggest the two are related. So above the
          breakpoint the pill simply follows the facts.

          `flex-wrap` covers the other end: the longest shipped line plus the
          pill measures 326px against 328px usable at 360px, so the fit is real
          but has no margin in it, and a longer localised bay name should drop
          the pill to a second line rather than squeeze the line the customer is
          there to read.

          Rendered as a sibling of the text, never inside the `<p>`: a control
          nested in a paragraph gets swept along by its wrapping, and this one
          has to stay a fixed-size target. */}
      {/* `pr-3 lg:pr-0` and the Session-row text classes, both deliberate: below
          `lg:` this row sits an inch above the collapsed sub-step summaries,
          which live INSIDE the form card's `p-3`. Without the matching right
          inset the two Change pills sat 12px apart at the right edge — the
          card is white-on-white, so that read as misalignment, not structure —
          and the subline was a size down (12px grey-600) from the summary
          values (14px grey-700), which between adjacent peer rows read as an
          accident. Same text, same edge, same separator: one recap language. */}
      {subline && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 pr-3 lg:pr-0">
          <p className="min-w-0 text-sm text-gray-700">{subline}</p>
          {onChangeSlot && changeSlotLabel && (
            <ChangeAnswerButton
              onClick={onChangeSlot}
              className="ml-auto lg:ml-0"
              ariaLabel={changeSlotAriaLabel}
            >
              {changeSlotLabel}
            </ChangeAnswerButton>
          )}
        </div>
      )}
    </header>
  );
}
