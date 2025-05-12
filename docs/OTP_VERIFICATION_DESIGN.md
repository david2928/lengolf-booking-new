# Design Considerations: OTP Phone Verification

## 1. Introduction & Goal

This document outlines the design considerations for implementing One-Time Password (OTP) phone verification as a potential enhancement to the user account linking process, specifically for the `/vip/link-account` page where users manually enter a phone number.

The primary goal of adding OTP verification is to increase the security and certainty of the account linking process by verifying that the user currently possesses the phone number they provide before attempting to link it to their authenticated profile (`profiles` record) and a corresponding customer record (`customers` record).

This would replace or augment the P0 approach (Option 1: No Direct Verification) or the alternative (Option 2: Explicit Confirmation) discussed in the main LENGOLF VIP LINE Integration design document.

## 2. High-Level User Flow (for `/vip/link-account`)

1.  User navigates to `/vip/link-account`.
2.  User enters their phone number in the input field.
3.  User clicks a "Send Verification Code" or similar button.
4.  **(Backend)** The system validates the phone number format.
5.  **(Backend)** The system generates a short numeric OTP (e.g., 6 digits).
6.  **(Backend)** The system initiates a request to an integrated SMS Gateway service to send the OTP via SMS to the user-provided phone number.
7.  **(Backend)** The system temporarily stores the OTP (hashed) and its expiry time, associated with the user's session or the phone number.
8.  **(Frontend)** The UI updates to show an input field for the OTP and potentially a timer indicating expiry.
9.  User receives the SMS containing the OTP.
10. User enters the received OTP into the input field.
11. User clicks a "Verify" or "Link Account" button.
12. **(Backend)** The system retrieves the submitted OTP and the user-provided phone number.
13. **(Backend)** The system looks up the stored (hashed) OTP and expiry time associated with the phone number/session.
14. **(Backend)** The system securely compares the submitted OTP with the stored hash. It also checks if the OTP has expired.
15. **OTP Valid:**
    *   **(Backend)** Mark the phone number as verified for this session/action.
    *   **(Backend)** Proceed to use this *verified* phone number to search the `customers` table for a matching CRM record (using logic similar to `matchProfileWithCrm`).
    *   **(Backend)** If match found, update/create the `crm_customer_mapping` record, setting `is_matched = true`.
    *   **(Frontend)** User is redirected to the main VIP interface or shown a success message.
16. **OTP Invalid (Incorrect or Expired):**
    *   **(Backend)** Increment an attempt counter (for rate limiting).
    *   **(Frontend)** Display an error message ("Invalid or expired code. Please try again."). Allow user to request a new code (subject to rate limits).

## 3. Required Components

*   **SMS Gateway Integration:** Need to choose and integrate a third-party SMS provider (e.g., Twilio, Vonage, MessageBird, AWS SNS, Supabase Auth has Twilio integration for phone auth which might be leverageable). This involves setting up an account, obtaining API keys, and potentially managing costs.
*   **Backend Logic:**
    *   OTP generation (secure random numbers).
    *   OTP hashing (e.g., bcrypt) before storage.
    *   Temporary OTP storage (e.g., separate Supabase table, Redis cache if available) with expiry timestamps.
    *   API endpoint(s) to handle:
        *   Initiating OTP send request.
        *   Verifying submitted OTP.
    *   Secure comparison of submitted OTP against stored hash.
    *   Rate limiting logic (per phone number, per user session, per IP).
*   **Frontend UI:**
    *   Input for phone number.
    *   Button to trigger OTP send.
    *   Input for OTP.
    *   Button to submit OTP.
    *   Display for error messages, success messages, expiry timers, resend options.

## 4. Database Considerations

*   **OTP Storage:** A mechanism to store the *hashed* OTP, associated phone number/user ID, creation timestamp, expiry timestamp, and attempt count is needed. This could be:
    *   A new Supabase table (e.g., `phone_otp_verifications`) with appropriate columns and potentially auto-deletion policies for expired/used records.
    *   A key-value store like Redis if available in the infrastructure.
*   **No changes** needed to `profiles`, `customers`, or `crm_customer_mapping` specifically for OTP *storage*, but the linking logic depends on the *outcome* of the OTP verification.

## 5. Security Considerations

*   **OTP Secrecy:** Never log or store OTPs in plain text. Always hash them before temporary storage.
*   **OTP Length & Complexity:** Use sufficiently long numeric OTPs (e.g., 6 digits).
*   **Expiry:** Implement relatively short expiry times (e.g., 5-15 minutes) for OTPs.
*   **Rate Limiting:** Crucial to prevent abuse and excessive SMS costs. Implement limits on:
    *   Number of OTP requests per phone number within a time window.
    *   Number of OTP verification attempts per phone number/session within a time window.
    *   Consider IP-based rate limiting as well.
*   **Secure Comparison:** Use timing-safe comparison functions when comparing the submitted OTP against the stored hash to prevent timing attacks.
*   **SMS Gateway Security:** Securely store and handle API keys for the SMS provider.
*   **Phishing/Social Engineering:** Users can still be tricked into revealing OTPs. OTP provides proof of *possession* of the phone, not necessarily proof of identity if the phone itself is compromised.

## 6. Cost Considerations

*   **SMS Gateway Fees:** Most providers charge per SMS message sent. Costs vary by provider and destination country (Thailand in this case).
*   **Volume Estimation:** Need to estimate:
    *   How many users are expected to use the manual `/vip/link-account` feature?
    *   What is the expected success/failure rate (failed attempts might lead to resend requests)?
*   **Provider Pricing Models:** Research pricing tiers of potential SMS providers (e.g., Twilio Pricing, Vonage SMS API Pricing, etc.). Look for free tiers or volume discounts.
*   **Finding Costs:** Check the pricing pages of potential SMS providers for per-message costs to Thailand. Multiply estimated volume by the per-message cost. Factor in potential costs for dedicated phone numbers if required by the provider.

## 7. Potential Providers / Implementation Notes

*   **Research Needed:** Investigate specific SMS providers popular/reliable in Thailand.
*   **Supabase Auth:** Supabase has built-in support for phone sign-ups/logins using Twilio for OTPs. While we are using NextAuth with a LINE provider primarily, it might be possible to leverage Supabase Auth's OTP functions *just* for this verification step if using Twilio is acceptable. This could simplify backend implementation but requires investigation.
*   **Twilio Verify API:** Twilio offers a dedicated "Verify" API that handles OTP generation, sending (SMS, voice, email), and verification, potentially simplifying backend logic further.

## 8. Open Questions for Internal Discussion

*   What is the acceptable cost per verification / monthly budget for SMS?
*   Which SMS Gateway provider is preferred based on reliability, cost, and ease of integration in Thailand?
*   Can we leverage existing Supabase Auth OTP capabilities (if using Twilio) even though primary auth is NextAuth/LINE?
*   What are the specific rate limiting parameters (e.g., max requests/attempts per hour/day)?
*   What should the exact OTP expiry time be?
*   How should failed OTP attempts be handled in the UI (allow resend immediately, after a delay?)?
*   Is OTP sufficient, or should we *still* show the "Is this you?" confirmation (Option 2) *after* successful OTP verification for an extra layer? 