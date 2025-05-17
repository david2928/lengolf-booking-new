# LENGOLF VIP Feature - Backend API Endpoints

This document provides a detailed specification for the backend API endpoints developed for the LENGOLF VIP feature. All endpoints are protected and require NextAuth authentication unless otherwise specified.

## 1. VIP Status

### `GET /api/vip/status`

*   **Task ID:** VIP-BE-003
*   **Description:** Checks the authenticated user's CRM linking status.
*   **Authentication:** Required (NextAuth).
*   **Request Body:** None.
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    *   **Scenario 1: Linked & Matched**
        ```json
        {
          "status": "linked_matched",
          "crmCustomerId": "some-crm-customer-id",
          "stableHashId": "some-stable-hash-id"
        }
        ```
    *   **Scenario 2: Linked & Unmatched (Placeholder)**
        ```json
        {
          "status": "linked_unmatched",
          "crmCustomerId": null,
          "stableHashId": null
        }
        ```
    *   **Scenario 3: Not Linked (Should ideally be handled by automatic placeholder creation during sign-in, but the endpoint should gracefully respond)**
        ```json
        {
          "status": "not_linked"
        }
        ```
*   **Error Responses:**
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `500 Internal Server Error`: For unexpected server issues.

## 2. Link Account

### `POST /api/vip/link-account`

*   **Task ID:** VIP-BE-004
*   **Description:** Allows an authenticated user (typically with `linked_unmatched` status) to attempt to link their profile to a CRM customer record using their phone number.
*   **Authentication:** Required (NextAuth).
*   **Request Body:**
    ```json
    {
      "phoneNumber": "0812345678"
    }
    ```
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    *   If a high-confidence match is found and the account is linked:
        ```json
        {
          "message": "Account linked successfully.",
          "status": "linked_matched",
          "crmCustomerId": "some-crm-customer-id",
          "stableHashId": "some-stable-hash-id"
        }
        ```
*   **Error Responses:**
    *   `400 Bad Request`: If `phoneNumber` is missing or invalid.
        ```json
        { "error": "Phone number is required." }
        ```
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `404 Not Found`: If no matching CRM customer account is found with high confidence.
        ```json
        { "error": "No matching customer account found." }
        ```
    *   `500 Internal Server Error`: For unexpected server issues.

## 3. User Profile

### `GET /api/vip/profile`

*   **Task ID:** VIP-BE-005
*   **Description:** Fetches the authenticated user's profile data. This combines information from the `profiles` table and the linked `customers` table (if a match exists).
*   **Authentication:** Required (NextAuth).
*   **Request Body:** None.
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
    {
      "name": "User Display Name", // from profiles.display_name
      "email": "user@example.com", // from profiles.email
      "phoneNumber": "0812345678", // from customers.contact_number if linked_matched, else null or from profiles
      "pictureUrl": "url-to-profile-picture", // from profiles.picture_url or similar
      "marketingPreference": true, // from profiles.marketing_preference
      "isMatched": true // boolean indicating if linked to a CRM record
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `404 Not Found`: If the user's profile does not exist (highly unlikely for an authenticated user).
    *   `500 Internal Server Error`: For unexpected server issues.

### `PUT /api/vip/profile`

*   **Task ID:** VIP-BE-006
*   **Description:** Updates the authenticated user's editable profile data in the `profiles` table.
*   **Authentication:** Required (NextAuth).
*   **Request Body (Fields are optional):**
    ```json
    {
      "name": "New User Display Name",
      "email": "new_user@example.com",
      "marketingPreference": false
    }
    ```
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
    {
      "message": "Profile updated successfully.",
      "updatedFields": ["name", "email", "marketingPreference"] // List of fields that were actually updated
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: If request body validation fails (e.g., invalid email format).
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `500 Internal Server Error`: For unexpected server issues.

## 4. Bookings

### `GET /api/vip/bookings`

*   **Task ID:** VIP-BE-007
*   **Description:** Fetches the authenticated user's past and future bookings. Requires the user to be linked and matched to a CRM customer (`is_matched = true`).
*   **Authentication:** Required (NextAuth).
*   **Request Body:** None.
*   **Query Parameters:**
    *   `page` (optional, number, default: 1): For pagination.
    *   `limit` (optional, number, default: 10): Number of bookings per page.
    *   `filter` (optional, string, default: 'all'): Can be 'future', 'past', or 'all'.
*   **Success Response (200 OK):**
    ```json
    {
      "data": [
        {
          "id": "booking-uuid-1",
          "date": "2024-08-15",
          "startTime": "14:00",
          "duration": 2, // hours
          "bay": "Bay 1",
          "numberOfPeople": 2,
          "status": "confirmed", // e.g., confirmed, cancelled
          "customerNotes": "Looking forward to it!",
          // ... other relevant booking details
        }
        // ... more bookings
      ],
      "pagination": {
        "currentPage": 1,
        "totalPages": 3,
        "totalItems": 25,
        "itemsPerPage": 10
      }
    }
    ```
    *   If the user is not linked and matched, or has no bookings, `data` will be an empty array.
*   **Error Responses:**
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `403 Forbidden`: If the user is authenticated but not linked/matched to a CRM customer (as this endpoint relies on the link to fetch relevant bookings).
    *   `500 Internal Server Error`: For unexpected server issues.

### `PUT /api/vip/bookings/{bookingId}/modify`

*   **Task ID:** VIP-BE-008
*   **Description:** Modifies a future, confirmed booking for the authenticated user. Involves availability checks and triggers asynchronous updates for Google Calendar and staff notifications.
*   **Authentication:** Required (NextAuth).
*   **Path Parameters:**
    *   `bookingId` (string, UUID): The ID of the booking to modify.
*   **Request Body:**
    ```json
    {
      "date": "2024-08-20",     // New date (YYYY-MM-DD)
      "startTime": "15:00",   // New start time (HH:mm)
      "duration": 3           // New duration in hours
    }
    ```
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
    {
      "message": "Booking modified successfully.",
      "booking": {
        "id": "booking-uuid-1",
        "date": "2024-08-20",
        "startTime": "15:00",
        "duration": 3,
        // ... other updated booking details
      }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: If request body validation fails (e.g., invalid date format, missing fields).
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `403 Forbidden`: If the user does not own the booking, or the booking is not in a modifiable state (e.g., past booking, already cancelled).
    *   `404 Not Found`: If the specified `bookingId` does not exist.
    *   `409 Conflict`: If the requested new slot is unavailable.
        ```json
        { "error": "Requested slot is not available." }
        ```
    *   `500 Internal Server Error`: For unexpected server issues (e.g., failure during async task initiation).

### `POST /api/vip/bookings/{bookingId}/cancel`

*   **Task ID:** VIP-BE-009
*   **Description:** Cancels a future, confirmed booking for the authenticated user. Triggers asynchronous updates for Google Calendar and staff notifications.
*   **Authentication:** Required (NextAuth).
*   **Path Parameters:**
    *   `bookingId` (string, UUID): The ID of the booking to cancel.
*   **Request Body:**
    ```json
    {
      "cancellationReason": "Change of plans" // Optional reason from user
    }
    ```
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
    {
      "message": "Booking cancelled successfully.",
      "booking": {
        "id": "booking-uuid-1",
        "status": "cancelled",
        "cancellationReason": "Change of plans",
        // ... other booking details
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `403 Forbidden`: If the user does not own the booking, or the booking is not in a cancellable state (e.g., past booking, already cancelled).
    *   `404 Not Found`: If the specified `bookingId` does not exist.
    *   `500 Internal Server Error`: For unexpected server issues.

## 5. Packages

### `GET /api/vip/packages`

*   **Task ID:** VIP-BE-010
*   **Description:** Fetches the authenticated user's active and past packages. Requires the user to be linked and matched to a CRM customer (`is_matched = true`).
*   **Authentication:** Required (NextAuth).
*   **Request Body:** None.
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
    {
      "activePackages": [
        {
          "id": "package-uuid-1",
          "packageName": "10 Hour Practice Package",
          "purchaseDate": "2024-07-01",
          "expiryDate": "2025-07-01",
          "totalHours": 10,
          "usedHours": 2,
          "remainingHours": 8
          // ... other relevant package details
        }
      ],
      "pastPackages": [
        {
          "id": "package-uuid-2",
          "packageName": "5 Hour Intro Package",
          "purchaseDate": "2023-01-10",
          "expiryDate": "2023-07-10",
          "totalHours": 5,
          "usedHours": 5,
          "remainingHours": 0
          // ... other relevant package details
        }
      ]
    }
    ```
    *   If the user is not linked/matched or has no packages, `activePackages` and `pastPackages` will be empty arrays.
*   **Error Responses:**
    *   `401 Unauthorized`: If the user is not authenticated.
    *   `403 Forbidden`: If the user is authenticated but not linked/matched to a CRM customer.
    *   `500 Internal Server Error`: For unexpected server issues. 