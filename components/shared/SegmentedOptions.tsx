'use client';

import { useId, type ComponentType, type SVGProps } from 'react';

/**
 * ONE idiom for every "pick one number" control on booking step 3.
 *
 * Duration and party size used to be drawn differently on purpose: a recessed
 * segmented track for duration, detached round tokens for the party. The
 * argument was that shape should signal "ordered scale" versus "count" before
 * either label was read. It does not survive contact with the screen — the two
 * sit about 40px apart, and two idioms that close together read as
 * inconsistency, not as meaning. Owner reported it on the QA build and they are
 * right.
 *
 * The track wins the merge for three reasons:
 *
 *  1. Party size is an ordered, bounded scale too. It runs 1..seatCap, it is
 *     capped by a maximum, and every value between the ends is valid — which is
 *     the same shape as the duration ladder, not a different one.
 *  2. It survives a variable option count. Circles at a fixed 48px wrap to a
 *     second row once there are seven of them at 360px (7 * 48 + 6 * 8 = 384px
 *     against ~304px of available width), and an ordered scale broken across
 *     two ragged rows reads as a rendering fault.
 *  3. Selection is a solid fill on a recessed rail, which is the contrast the
 *     duration ladder was already redesigned to get. The pale-tint selected
 *     state it replaced measured ~1.2:1 against its neighbours; at arm's length
 *     on a phone the picker read as having nothing selected at all.
 */

/**
 * Column counts as LITERAL class strings, never interpolated: Tailwind 3
 * scans source text, so `grid-cols-${n}` would compile to nothing at all.
 *
 * Beyond five, wrap at four rather than adding columns. The binding case is a
 * package holder's seven duration rungs at a 360px viewport, where the block
 * has ~304px to work with (360 - 32 page gutter - 24 form padding). Seven
 * across would be (296 - 6*4) / 7 = 42px, under the 44px minimum touch target;
 * four across is (296 - 3*4) / 4 = 71px and lays seven out as 4 + 3 with one
 * trailing gap. Five across, the common case, is 56px.
 */
const RAIL_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

export interface SegmentedOptionsProps {
  /** Group heading, e.g. "Duration (in hours)". Already localised. */
  label: string;
  /** Heroicon-shaped component rendered before the label. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * The rungs to offer, in order. Length is decided by the caller and varies at
   * runtime (the duration ladder is capped by the chosen bay type's headroom;
   * the party picker by the selected set's capacity), so the layout reads it
   * rather than being told a column count.
   */
  options: number[];
  value: number;
  onChange: (value: number) => void;
  /** Defaults to the number itself; duration passes `formatDurationLabel`. */
  formatOption?: (option: number) => string;
  /** Validation message rendered under the rail and wired to it for AT. */
  error?: string;
  /** Applied to the outer block, e.g. a test id. */
  'data-testid'?: string;
}

export function SegmentedOptions({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  formatOption,
  error,
  'data-testid': testId,
}: SegmentedOptionsProps) {
  /* The label is a heading for a group of buttons, not a form control's label,
     so it is a <p> pointed at by `aria-labelledby` rather than a <label> with
     nothing to be `for`. Both pickers used a dangling <label> before this. */
  const labelId = useId();
  const errorId = useId();

  const columns = RAIL_COLUMNS[options.length] ?? 'grid-cols-4';

  return (
    <div data-testid={testId}>
      <p id={labelId} className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        className={`grid gap-1 rounded-xl bg-gray-100 p-1 ${columns}`}
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            /* `tabular-nums` so 1.5 and 2.5 line their decimal points up with
               each other and with the whole-number rungs. */
            className={`flex h-11 items-center justify-center rounded-lg tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
              value === option
                ? 'bg-green-600 font-semibold text-white shadow-sm'
                : 'text-gray-700 hover:bg-white/70 active:bg-white'
            }`}
          >
            {formatOption ? formatOption(option) : option}
          </button>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
