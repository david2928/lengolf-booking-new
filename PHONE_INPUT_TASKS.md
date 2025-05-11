# Phone Number Input with Country Code - Tasks

This document lists the tasks required to implement the new phone number input with a country code selector in `BookingDetails.tsx`.

## 1. Setup & Installation

-   [ ] **Install `react-phone-number-input` library:**
    -   Run `npm install react-phone-number-input` or `yarn add react-phone-number-input`.

## 2. Frontend Implementation (`app/(features)/bookings/components/booking/steps/BookingDetails.tsx`)

-   [ ] **Import necessary components and styles:**
    -   Import `PhoneInput`, `isValidPhoneNumber` from `react-phone-number-input`.
    -   Import the library's CSS: `import 'react-phone-number-input/style.css';`.
-   [ ] **Replace existing phone number input:**
    -   Remove the current `<input type="tel">` for the phone number.
    -   Add the `<PhoneInput />` component with appropriate props (`international`, `defaultCountry="TH"`, `placeholder`, `value`, `onChange`).
-   [ ] **Update state management for pre-filled numbers:**
    -   Modify the `useEffect` that fetches and sets the profile data.
    -   Implement logic to pre-process `data.phone_number` or `session.user.phone`:
        -   If the number is in a local format (e.g., starts with '0' for a 10-digit Thai number), attempt to convert it to E.164 by prepending the default country code (e.g., `+66`) before setting it to the `phoneNumber` state.
-   [ ] **Update validation logic:**
    -   Modify the `validateForm` function.
    -   Replace the existing phone number regex validation with `isValidPhoneNumber(phoneNumber)` from the library.
    -   Ensure error messages (`errors.phoneNumber`) are set and cleared correctly.
    -   Remove or comment out the old `validatePhoneNumber` utility function if it's no longer needed.
-   [ ] **Remove old `handlePhoneChange` function:**
    -   This function will no longer be needed as `PhoneInput`'s `onChange` directly updates the `phoneNumber` state with an E.164 formatted string.
-   [ ] **Update submit button `disabled` state:**
    -   Ensure the submit button's `disabled` logic correctly uses `isValidPhoneNumber(phoneNumber)` for validation if the phone number is a required field for submission.
    -   The condition `!validatePhoneNumber(phoneNumber)` should be changed to `!phoneNumber || !isValidPhoneNumber(phoneNumber)` (or similar, depending on whether an empty number is allowed initially).

## 3. Styling

-   [ ] **Apply custom styling to `PhoneInput`:**
    -   Add a custom class (e.g., `custom-phone-input`) to the `PhoneInput` component.
    -   Create CSS rules to make the component's appearance (height, border, focus state, font size, etc.) consistent with other input fields in the booking form.
    -   Test responsiveness and appearance on different screen sizes.

## 4. Testing

-   [ ] **Test with new users (no pre-filled number):**
    -   Verify country code selection works.
    -   Verify number input and formatting for various countries.
    -   Verify validation (valid and invalid numbers).
    -   Verify default country is correctly selected initially.
-   [ ] **Test with existing users (pre-filled number):**
    -   Test with numbers already in E.164 format (e.g., `+66...`, `+1...`).
    -   Test with numbers in common local formats (e.g., `08...` for Thailand, assuming "TH" is the default) to ensure they are correctly parsed and the country selector is set.
    -   Test cases where a pre-filled number might be ambiguous or for a non-default country.
-   [ ] **Test form submission:**
    -   Ensure the E.164 formatted phone number is correctly sent to the backend.
    -   Confirm booking creation works as expected with the new phone number format.
-   [ ] **Test form validation messages:**
    -   Ensure correct error messages are displayed for invalid phone numbers.
-   [ ] **Cross-browser and cross-device testing.**

## 5. (Optional) Backend & Data Considerations

-   [ ] **Review `profiles` table:**
    -   Consider if a data migration is needed/feasible to convert existing phone numbers in the `profiles` table to E.164 format for better consistency, although the frontend pre-processing should handle most common cases.

## 6. Code Review and Refinement

-   [ ] **Conduct a code review of all changes.**
-   [ ] **Refactor and clean up code as needed.** 