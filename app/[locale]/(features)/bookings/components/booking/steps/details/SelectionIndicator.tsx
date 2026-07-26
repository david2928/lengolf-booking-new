'use client';

import { CheckIcon } from '@heroicons/react/24/outline';

/**
 * The two selection glyphs of booking step 3, defined in one place so the
 * shape difference keeps meaning something.
 *
 *   circle   → pick ONE of these (club rental: one set, or none)
 *   square   → pick ANY NUMBER of these (Gear Up: independent add-ons)
 *
 * WHY BOTH EXIST
 *
 * Club rental and Gear Up sit directly on top of each other and their models
 * genuinely differ, so the answer was never to draw them the same. But before
 * this the club sets carried NO glyph at all and signalled single-select purely
 * by the absence of the checkbox on the row below — which asks the customer to
 * notice something that is not there, then infer a rule from it. The owner
 * flagged the pair on the QA build.
 *
 * The glyph now carries the whole distinction, and everything else about the
 * two rows is deliberately identical: same leading position, same size, same
 * row layout. Shape is the ONLY difference, which is what makes it readable as
 * meaning rather than as drift. The checkbox in particular moved from the
 * trailing edge to the leading edge for this reason; it is no longer paired
 * with the price, it is paired with the club rows' radios.
 *
 * These are decoration. The real state lives on the native `<input>` each row
 * hides behind `sr-only`, which is what assistive tech reads and what gives the
 * radio group its arrow keys. Never let this component become the only record
 * of what is selected.
 */

export interface SelectionIndicatorProps {
  kind: 'radio' | 'checkbox';
  selected: boolean;
  /**
   * The Premium+ row inverts to near-black green when chosen, where a
   * green-on-green glyph disappears. Same shapes, light palette.
   */
  onDark?: boolean;
}

export function SelectionIndicator({ kind, selected, onDark = false }: SelectionIndicatorProps) {
  /* `rounded-full` vs `rounded-md` is the entire semantic payload of this
     component. Both are h-5 w-5 so neither reads as the more important of the
     two. */
  const shape = kind === 'radio' ? 'rounded-full' : 'rounded-md';

  const palette = selected
    ? onDark
      ? 'border-white bg-white'
      : 'border-green-600 bg-green-600'
    : onDark
      ? 'border-white/50'
      : 'border-gray-300 bg-white';

  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center border-2 transition-colors ${shape} ${palette}`}
    >
      {selected &&
        (kind === 'radio' ? (
          /* A filled dot, not a tick: a tick inside a circle is the shape pair
             that makes radio and checkbox look interchangeable again. */
          <span
            className={`h-2 w-2 rounded-full ${onDark ? 'bg-[#003d1f]' : 'bg-white'}`}
          />
        ) : (
          <CheckIcon
            className={`h-3.5 w-3.5 stroke-[3] ${onDark ? 'text-[#003d1f]' : 'text-white'}`}
          />
        ))}
    </span>
  );
}
