# Phone Number Input with Country Code - Design Document

## 1. Overview

This document outlines the design for enhancing the phone number input field in the booking form (`BookingDetails.tsx`) by adding a country code selector. The goal is to improve user experience, reduce input errors, and maintain compatibility with the backend which expects a full phone number string.

## 2. Current Implementation

-   **Frontend (`BookingDetails.tsx`):**
    -   A single text input field is used for the phone number.
    -   State: `phoneNumber` (string).
    -   Validation: `validatePhoneNumber` function checks for a string that can start with `+` and contains 10-15 digits.
    -   Prefill: Loads `profile.phone_number` or `session.user.phone` directly into the input. These are expected to be full phone number strings.
-   **Backend (`/api/bookings/create/route.ts`):**
    -   Expects `phone_number` as a single string in the request body.
    -   Uses this string directly for notifications and other processing.

## 3. Proposed Solution

### 3.1. UI Component Choice

We will integrate the `react-phone-number-input` library.
-   **Reasoning:** It provides a good user experience with a dropdown for country selection (including flags), automatically formats the number as the user types, and handles validation for different countries. It simplifies parsing and formatting.
-   **Installation:** `npm install react-phone-number-input` or `yarn add react-phone-number-input`. It also requires its CSS: `import 'react-phone-number-input/style.css'`.

### 3.2. UI Changes (`BookingDetails.tsx`)

-   Replace the existing `<input type="tel">` for the phone number with the `<PhoneInput />` component from `react-phone-number-input`.
    ```tsx
    // At the top of BookingDetails.tsx
    import PhoneInput, { isValidPhoneNumber, parsePhoneNumber } from 'react-phone-number-input';
    import 'react-phone-number-input/style.css'; // Import styles

    // ... inside the component
    // const [phoneNumber, setPhoneNumber] = useState(''); // This state will now hold the E.164 formatted number
    // ...

    // In the form:
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Phone Number
    </label>
    <PhoneInput
      international
      defaultCountry="TH" // Set a default country, e.g., Thailand
      placeholder="Enter phone number"
      value={phoneNumber} // phoneNumber state will store the E.164 value
      onChange={setPhoneNumber} // The library handles setting the E.164 formatted string
      className="custom-phone-input" // Add a class for custom styling if needed
      // Apply custom styling to make it look similar to other inputs if default is too different
    />
    // Helper text can be updated or removed if the component is self-explanatory
    // Error display:
    // {errors.phoneNumber && (
    //   <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>
    // )}
    ```
-   **Styling:** We may need to add custom CSS to ensure the `PhoneInput` component visually aligns with the other input fields in the form. A wrapper div with the necessary classes from the existing input might be needed.

### 3.3. State Management

-   The existing `phoneNumber` state (`useState<string>('')`) will continue to be used.
-   `react-phone-number-input`'s `onChange` handler will provide the phone number in E.164 format (e.g., `+12223334444`) or undefined if the input is incomplete/invalid. This E.164 format is what we want to store and send to the backend.

### 3.4. Handling Pre-filled Numbers

-   When `profile.phone_number` or `session.user.phone` is available, it will be directly passed to the `value` prop of the `PhoneInput` component.
-   `react-phone-number-input` is capable of parsing E.164 formatted numbers and correctly setting the country selector and national number.
-   **Potential Issue:** If the stored phone number is not in E.164 format (e.g., local format like `0812345678` for Thailand), the library might not correctly parse it or select the country.
    -   **Mitigation:** We should encourage storing numbers in E.164 format in user profiles.
    -   **Fallback for non-E.164:** If a number is loaded that *doesn't* start with `+`, we can attempt to prepend a default country code (e.g., `+66` for Thailand if the number looks like a Thai local number) before passing it to `PhoneInput`. This requires careful logic.
        ```typescript
        // Inside useEffect for fetching profile data:
        let initialPhoneNumber = data.phone_number || session?.user?.phone || '';
        if (initialPhoneNumber && !initialPhoneNumber.startsWith('+')) {
          // Basic assumption: if it's a 10-digit number starting with 0, assume it's a Thai number
          if (initialPhoneNumber.length === 10 && initialPhoneNumber.startsWith('0')) {
            initialPhoneNumber = '+66' + initialPhoneNumber.substring(1);
          }
          // Add more rules if necessary for other common local formats
        }
        setPhoneNumber(initialPhoneNumber);
        ```
        This pre-processing step ensures that `PhoneInput` receives a value it's more likely to parse correctly.

### 3.5. Validation

-   The `react-phone-number-input` library provides its own validation. We can use its `isValidPhoneNumber` utility.
    ```typescript
    // Import: import { isValidPhoneNumber } from 'react-phone-number-input'

    // In validateForm function:
    if (phoneNumber && !isValidPhoneNumber(phoneNumber)) { // Use phoneNumber state which is E.164
      setErrors(prev => ({ ...prev, phoneNumber: 'Please enter a valid phone number' }));
      toast.error('Please enter a valid phone number');
      return false;
    } else if (!phoneNumber) { // If it's required
      setErrors(prev => ({ ...prev, phoneNumber: 'Phone number is required' }));
      toast.error('Phone number is required');
      return false;
    } else {
      setErrors(prev => ({ ...prev, phoneNumber: '' })); // Clear error
    }
    ```
-   The old `validatePhoneNumber` regex function can be removed or kept as a secondary check if deemed necessary, but `isValidPhoneNumber` from the library is generally more robust for international numbers.
-   The `handlePhoneChange` function will be replaced by the `onChange` directly provided by `PhoneInput` to `setPhoneNumber`.

### 3.6. Data Submission

-   The `phoneNumber` state will already contain the E.164 formatted string (e.g., `+12223334444`).
-   This string will be sent as is to the `/api/bookings/create` endpoint, which already expects a full phone number string. No changes are needed in the submission logic itself regarding the phone number format.

## 4. Backend Considerations

-   No changes are anticipated for the `/api/bookings/create/route.ts` as it already handles a full phone number string.
-   It's recommended to ensure all phone numbers stored in the `profiles` table are in E.164 format for consistency and to simplify pre-filling. A one-time data migration might be considered if many numbers are in local formats.

## 5. Edge Cases and Considerations

-   **Default Country:** Setting a sensible `defaultCountry` (e.g., "TH" for Thailand) in `PhoneInput` is important for users who don't have a saved number.
-   **CSS Styling:** The default styling of `react-phone-number-input` might differ from existing form inputs. Custom CSS will be needed to ensure visual consistency.
-   **User Experience for Ambiguous Local Numbers:** If a user has `0812345678` saved and the default country is Thailand, it should parse correctly when we prepend `+66`. If their actual number was for a different country but in a similar local format, they would need to manually correct the country selector. This is a reasonable trade-off.

## 6. Alternatives Considered

-   **Custom Input with Dropdown:** Building a custom country code dropdown and input logic would be more complex to implement and maintain, especially regarding validation and formatting for all countries.
-   **Separate Input Fields:** Having two separate input fields (one for country code, one for national number) is less user-friendly than an integrated component.

The `react-phone-number-input` library offers the most robust and user-friendly solution. 