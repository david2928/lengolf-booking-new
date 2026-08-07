/**
 * The wiring that carries `contactTouched` from the hook to the card gate.
 *
 * `contact-card-never-swaps-mid-typing.test.tsx` pins the GATE, but it drives a
 * harness that re-implements the latch, so it proves nothing about
 * `useBookingDetailsForm` or the prop chain through `BookingDetails`. Two edits
 * would therefore go green while restoring a bug that truncated seven customers'
 * email addresses:
 *
 *   1. Pointing a prefill effect at a `*Edited` setter. That latches the guard on
 *      the app's own behalf and kills the identity card for every returning
 *      customer — a silent UX regression with no error anywhere.
 *   2. Dropping `contactTouched` from the hook's return or from the
 *      `<YourDetailsStep>` call site. The prop arrives `undefined`, `!undefined`
 *      is `true`, and the gate is permanently open again.
 *
 * Source-level by necessity, in the manner of `mobile-nav-scroll.test.ts`: both
 * failures are about which identifier appears where, and a render test cannot
 * see either. The patterns below are deliberately loose about formatting and
 * strict about the identifiers, so reformatting does not fail the build.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const DETAILS = join(
  process.cwd(),
  'app/[locale]/(features)/bookings/components/booking/steps/details',
);
const STEPS = join(process.cwd(), 'app/[locale]/(features)/bookings/components/booking/steps');

const hook = readFileSync(join(DETAILS, 'useBookingDetailsForm.ts'), 'utf8');
const bookingDetails = readFileSync(join(STEPS, 'BookingDetails.tsx'), 'utf8');
const yourDetailsStep = readFileSync(join(DETAILS, 'YourDetailsStep.tsx'), 'utf8');

/** Strip block and line comments so prose mentioning a setter cannot match. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('contactTouched survives the trip from hook to gate', () => {
  it('is exported by the hook', () => {
    // The return object is the seam; without this the prop is `undefined`.
    expect(code(hook)).toMatch(/^\s*contactTouched,\s*$/m);
  });

  it('is forwarded by BookingDetails to YourDetailsStep', () => {
    expect(code(bookingDetails)).toMatch(/contactTouched=\{contactTouched\}/);
  });

  it('gates the identity card in YourDetailsStep', () => {
    const gate = code(yourDetailsStep).match(/const\s+showIdentityCard\s*=([\s\S]*?);/);
    expect(gate).not.toBeNull();
    expect(gate![1]).toMatch(/!contactTouched/);
  });
});

describe('prefill never latches the guard on the customer\'s behalf', () => {
  /**
   * Every prefill source must use the RAW setters. `takeContactDraft` is included
   * deliberately: it restores values the customer typed before leaving to sign
   * in, and using the wrapped setters there would be the most plausible-looking
   * mistake of the three.
   */
  it('no *Edited setter is called anywhere inside the hook', () => {
    // The wrappers are DEFINED here and must be called only by the JSX, via the
    // renamed exports. A call inside the hook body is either prefill or an
    // effect, and both are wrong.
    const body = code(hook);
    const calls = body.match(/\bset(?:Name|Email|PhoneNumber)Edited\s*\(/g) ?? [];
    expect(calls).toEqual([]);
  });

  it('routes both guards through the single markContactTouched helper', () => {
    const body = code(hook);
    // Exactly one place raises the ref, so the two representations of "the
    // customer has typed" cannot drift apart.
    const refWrites = body.match(/userEditedContact\.current\s*=\s*true/g) ?? [];
    expect(refWrites).toHaveLength(1);
    const stateWrites = body.match(/setContactTouched\(true\)/g) ?? [];
    expect(stateWrites).toHaveLength(1);
    expect(body).toMatch(/const\s+markContactTouched\s*=/);
  });

  it('still hands the wrapped setters out under the public names', () => {
    // The rename is what guarantees the only route in from outside the hook is a
    // customer keystroke. If these revert to the raw setters, typing stops
    // latching anything and the truncation returns.
    const body = code(hook);
    expect(body).toMatch(/setPhoneNumber:\s*setPhoneNumberEdited/);
    expect(body).toMatch(/setEmail:\s*setEmailEdited/);
    expect(body).toMatch(/setName:\s*setNameEdited/);
  });
});
