# API Reference Documentation

## Overview
The Lengolf Booking Refactor API provides comprehensive endpoints for booking management, VIP customer portal functionality, CRM integration, and notification services. Built with Next.js 14 API routes and integrated with Supabase, the API follows RESTful principles with consistent error handling and authentication.

## 🔐 Authentication

### NextAuth.js Integration
All protected endpoints require authentication via NextAuth.js JWT tokens.

```typescript
// Authentication header format
Authorization: Bearer <jwt_token>

// Session-based authentication (automatic for browser requests)
Cookie: next-auth.session-token=<session_token>
```

### Authentication Providers
- **Google OAuth**: Primary authentication method
- **Facebook OAuth**: Secondary authentication option
- **LINE Login**: Ready for LINE integration
- **Guest Registration**: Temporary account creation

## 🌐 Base URL & Versioning

```
Base URL: https://len.golf/api
Environment: Production
API Version: v1 (implicit)
```

## 📋 API Categories

### 1. Authentication APIs
- **Endpoint Base**: `/api/auth`
- **Purpose**: User authentication and session management
- **Provider**: NextAuth.js

### 2. VIP Customer APIs
- **Endpoint Base**: `/api/vip`
- **Purpose**: VIP customer portal functionality
- **Authentication**: Required

### 3. Booking Management APIs
- **Endpoint Base**: `/api/bookings`
- **Purpose**: Booking creation and management
- **Authentication**: Optional (guest bookings supported)

### 4. Availability APIs
- **Endpoint Base**: `/api/availability`
- **Purpose**: Real-time bay availability checking
- **Authentication**: Optional

### 5. CRM Integration APIs
- **Endpoint Base**: `/api/crm`
- **Purpose**: Customer relationship management
- **Authentication**: Required

### 6. Notification APIs
- **Endpoint Base**: `/api/notifications`
- **Purpose**: Email and LINE messaging
- **Authentication**: Required

### 7. Admin APIs
- **Endpoint Base**: `/api/admin`
- **Purpose**: Administrative functions
- **Authentication**: Required (admin role)

## 🔧 VIP Customer APIs

### Get VIP Status
```http
GET /api/vip/status
```

**Description**: Check the authenticated user's CRM linking status.

**Authentication**: Required

**Response**:
```typescript
interface VipStatusResponse {
  status: 'linked_matched' | 'linked_unmatched' | 'not_linked';
  crmCustomerId?: string;
  stableHashId?: string;
}
```

**Example Response**:
```json
{
  "status": "linked_matched",
  "crmCustomerId": "CRM-12345",
  "stableHashId": "abc123def456"
}
```

### Get VIP Profile
```http
GET /api/vip/profile
```

**Description**: Fetch the authenticated user's complete profile information.

**Authentication**: Required

**Response**:
```typescript
interface VipProfile {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  pictureUrl?: string;
  marketingPreference: boolean;
  crmStatus: 'linked_matched' | 'linked_unmatched' | 'not_linked';
  crmCustomerId?: string;
  stableHashId?: string;
  vipTier?: {
    id: number;
    name: string;
    description: string;
  };
}
```

**Example Response**:
```json
{
  "id": "user-uuid-123",
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "0812345678",
  "marketingPreference": true,
  "crmStatus": "linked_matched",
  "crmCustomerId": "CRM-12345",
  "stableHashId": "abc123def456",
  "vipTier": {
    "id": 1,
    "name": "Eagle",
    "description": "Premium tier with exclusive benefits"
  }
}
```

### Update VIP Profile
```http
PUT /api/vip/profile
```

**Description**: Update the authenticated user's editable profile information.

**Authentication**: Required

**Request Body**:
```typescript
interface ProfileUpdateRequest {
  display_name?: string;
  email?: string;
  marketingPreference?: boolean;
  vip_phone_number?: string;
}
```

**Example Request**:
```json
{
  "display_name": "John Smith",
  "email": "johnsmith@example.com",
  "marketingPreference": false,
  "vip_phone_number": "0812345679"
}
```

**Response**:
```json
{
  "message": "Profile updated successfully.",
  "updatedFields": ["display_name", "email", "marketingPreference"]
}
```

### Link Account
```http
POST /api/vip/link-account
```

**Description**: Manually link user account to CRM customer record using phone number.

**Authentication**: Required

**Request Body**:
```json
{
  "phoneNumber": "0812345678"
}
```

**Success Response** (200):
```json
{
  "message": "Account linked successfully.",
  "status": "linked_matched",
  "crmCustomerId": "CRM-12345",
  "stableHashId": "abc123def456"
}
```

**Error Response** (404):
```json
{
  "error": "No matching customer account found."
}
```

### Get VIP Bookings
```http
GET /api/vip/bookings?page=1&limit=10&filter=all
```

**Description**: Fetch the authenticated user's booking history.

**Authentication**: Required

**Query Parameters**:
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Items per page (default: 10)
- `filter` (optional): 'future', 'past', or 'all' (default: 'all')

**Response**:
```typescript
interface BookingListResponse {
  data: Booking[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

interface Booking {
  id: string;
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:mm
  duration: number;          // hours
  bay: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  numberOfPeople: number;
  customerNotes?: string;
}
```

**Example Response**:
```json
{
  "data": [
    {
      "id": "booking-123",
      "date": "2024-01-20",
      "startTime": "14:00",
      "duration": 2,
      "bay": "Bay 1",
      "status": "confirmed",
      "numberOfPeople": 2,
      "customerNotes": "Looking forward to the session!"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 25,
    "itemsPerPage": 10
  }
}
```

### Modify VIP Booking
```http
PUT /api/vip/bookings/{bookingId}/modify
```

**Description**: Modify a future, confirmed booking's date, time, or duration.

**Authentication**: Required

**Path Parameters**:
- `bookingId`: UUID of the booking to modify

**Request Body**:
```json
{
  "date": "2024-01-25",
  "startTime": "15:00",
  "duration": 3
}
```

**Success Response**:
```json
{
  "message": "Booking modified successfully.",
  "booking": {
    "id": "booking-123",
    "date": "2024-01-25",
    "startTime": "15:00",
    "duration": 3,
    "bay": "Bay 2",
    "status": "confirmed"
  }
}
```

**Error Responses**:
- `403`: User doesn't own booking or booking not modifiable
- `404`: Booking not found
- `409`: Requested slot unavailable

### Cancel VIP Booking
```http
POST /api/vip/bookings/{bookingId}/cancel
```

**Description**: Cancel a future, confirmed booking.

**Authentication**: Required

**Request Body**:
```json
{
  "cancellationReason": "Change of plans"
}
```

**Response**:
```json
{
  "message": "Booking cancelled successfully.",
  "booking": {
    "id": "booking-123",
    "status": "cancelled",
    "cancellationReason": "Change of plans"
  }
}
```

### Get VIP Packages
```http
GET /api/vip/packages
```

**Description**: Fetch the authenticated user's package information.

**Authentication**: Required

**Response**:
```typescript
interface PackageListResponse {
  activePackages: Package[];
  pastPackages: Package[];
}

interface Package {
  id: string;
  packageName: string;
  purchaseDate: string;      // YYYY-MM-DD
  expiryDate?: string;       // YYYY-MM-DD
  totalHours: number;
  usedHours: number;
  remainingHours: number;
  status: 'active' | 'depleted' | 'expired';
}
```

## 🏌️ Booking Management APIs

### Create Booking
```http
POST /api/bookings/create
```

**Description**: Create a new golf bay booking.

**Authentication**: Optional (supports guest bookings)

**Request Body**:
```typescript
interface CreateBookingRequest {
  date: string;                    // YYYY-MM-DD
  startTime: string;               // HH:mm
  duration: number;                // hours
  bay?: string;                    // optional bay preference
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  numberOfPeople: number;
  specialRequests?: string;
  packageId?: string;              // for package bookings
}
```

**Example Request**:
```json
{
  "date": "2024-01-20",
  "startTime": "14:00",
  "duration": 2,
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "0812345678",
  "numberOfPeople": 2,
  "specialRequests": "First time visitor"
}
```

**Response**:
```json
{
  "success": true,
  "bookingId": "booking-uuid-123",
  "bookingReference": "BK240120DOE001",
  "calendarEventId": "cal-event-456",
  "confirmationSent": true
}
```

### Create Calendar Event
```http
POST /api/bookings/calendar/create
```

**Description**: Create a Google Calendar event for a booking.

**Authentication**: Required (system use)

**Request Body**:
```json
{
  "bookingId": "booking-uuid-123",
  "calendarId": "bay1@len.golf",
  "eventDetails": {
    "summary": "Golf Booking - John Doe",
    "start": "2024-01-20T14:00:00+07:00",
    "end": "2024-01-20T16:00:00+07:00",
    "description": "2 people, Bay 1"
  }
}
```

## 🎯 Availability APIs

### Check General Availability
```http
GET /api/availability?date=2024-01-20
```

**Description**: Get available time slots for a specific date.

**Authentication**: Optional

**Query Parameters**:
- `date`: Date in YYYY-MM-DD format

**Response**:
```typescript
interface AvailabilityResponse {
  date: string;
  availableSlots: AvailabilitySlot[];
  fullyBooked: boolean;
}

interface AvailabilitySlot {
  startTime: string;               // HH:mm
  endTime: string;                 // HH:mm
  bay: string;
  capacity: number;
  price: number;
  available: boolean;
}
```

**Example Response**:
```json
{
  "date": "2024-01-20",
  "availableSlots": [
    {
      "startTime": "09:00",
      "endTime": "11:00",
      "bay": "Bay 1",
      "capacity": 4,
      "price": 2000,
      "available": true
    },
    {
      "startTime": "14:00",
      "endTime": "16:00",
      "bay": "Bay 2",
      "capacity": 4,
      "price": 2500,
      "available": true
    }
  ],
  "fullyBooked": false
}
```

### Check Specific Availability
```http
POST /api/availability/check
```

**Description**: Verify availability for a specific time slot and duration.

**Authentication**: Optional

**Request Body**:
```json
{
  "date": "2024-01-20",
  "startTime": "14:00",
  "duration": 2,
  "bay": "Bay 1"
}
```

**Response**:
```json
{
  "available": true,
  "assignedBay": "Bay 1",
  "conflictReason": null,
  "alternativeTimes": []
}
```

**Conflict Response**:
```json
{
  "available": false,
  "assignedBay": null,
  "conflictReason": "Bay already booked",
  "alternativeTimes": ["15:00", "16:00", "17:00"]
}
```

## 👥 CRM Integration APIs

### Get Customer Mapping
```http
GET /api/crm/mapping
```

**Description**: Get the authenticated user's CRM customer mapping status.

**Authentication**: Required

**Response**:
```json
{
  "profileId": "user-uuid-123",
  "crmCustomerId": "CRM-12345",
  "stableHashId": "abc123def456",
  "isMatched": true,
  "crmCustomerData": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "0812345678"
  }
}
```

### Match Customer
```http
POST /api/crm/match
```

**Description**: Attempt to match user with existing CRM customer.

**Authentication**: Required

**Request Body**:
```json
{
  "phoneNumber": "0812345678",
  "email": "john@example.com",
  "name": "John Doe"
}
```

**Response**:
```json
{
  "matched": true,
  "confidence": 0.95,
  "crmCustomerId": "CRM-12345",
  "matchedFields": ["phone", "email", "name"]
}
```

### Get CRM Profile
```http
GET /api/crm/profile
```

**Description**: Get customer profile from CRM system.

**Authentication**: Required

**Response**:
```json
{
  "customerId": "CRM-12345",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "0812345678",
  "membershipTier": "VIP",
  "totalBookings": 45,
  "lastBooking": "2024-01-15"
}
```

### Get CRM Packages
```http
GET /api/crm/packages
```

**Description**: Get customer's package information from CRM.

**Authentication**: Required

**Response**:
```json
{
  "packages": [
    {
      "id": "PKG-001",
      "name": "10 Hour Practice Package",
      "totalHours": 10,
      "usedHours": 3,
      "remainingHours": 7,
      "purchaseDate": "2024-01-01",
      "expiryDate": "2024-07-01",
      "status": "active"
    }
  ]
}
```

### Sync Packages
```http
POST /api/crm/sync-packages
```

**Description**: Synchronize package data from external CRM system.

**Authentication**: Required (admin)

**Response**:
```json
{
  "success": true,
  "syncedPackages": 156,
  "errors": 0,
  "lastSync": "2024-01-20T10:30:00Z"
}
```

## 📬 Notification APIs

### Send LINE Notification
```http
POST /api/notifications/line
```

**Description**: Send notification via LINE messaging.

**Authentication**: Required (system)

**Request Body**:
```json
{
  "groupId": "line-group-123",
  "message": "New booking created: BK240120DOE001",
  "type": "booking_created"
}
```

### Send Email Notification
```http
POST /api/notifications/email
```

**Description**: Send email notification.

**Authentication**: Required (system)

**Request Body**:
```json
{
  "to": "customer@example.com",
  "subject": "Booking Confirmation",
  "template": "booking_confirmation",
  "data": {
    "bookingReference": "BK240120DOE001",
    "customerName": "John Doe",
    "date": "2024-01-20",
    "startTime": "14:00"
  }
}
```

### Schedule Review Request
```http
POST /api/notifications/schedule-review-request
```

**Description**: Schedule a review request for a completed booking.

**Authentication**: Required (system)

**Request Body**:
```json
{
  "bookingId": "booking-uuid-123",
  "scheduledTime": "2024-01-20T16:30:00Z",
  "customerEmail": "john@example.com",
  "customerName": "John Doe"
}
```

### Send Review Request
```http
POST /api/notifications/send-review-request
```

**Description**: Send a review request to a customer.

**Authentication**: Required (system)

**Request Body**:
```json
{
  "bookingId": "booking-uuid-123",
  "customerEmail": "john@example.com",
  "deliveryMethod": "email"
}
```

### Process Review Requests
```http
POST /api/notifications/process-review-requests
```

**Description**: Process scheduled review requests (cron job endpoint).

**Authentication**: Required (system)

**Response**:
```json
{
  "processed": 15,
  "sent": 12,
  "failed": 3,
  "errors": [
    {
      "bookingId": "booking-456",
      "error": "Invalid email address"
    }
  ]
}
```

### Email Cancellation
```http
POST /api/notifications/email/cancellation
```

**Description**: Send booking cancellation email.

**Authentication**: Required (system)

**Request Body**:
```json
{
  "bookingId": "booking-uuid-123",
  "customerEmail": "john@example.com",
  "cancellationReason": "Customer request"
}
```

### LINE Review Request
```http
POST /api/notifications/line/review-request
```

**Description**: Send review request via LINE.

**Authentication**: Required (system)

**Request Body**:
```json
{
  "bookingId": "booking-uuid-123",
  "lineUserId": "line-user-456",
  "customerName": "John Doe"
}
```

## 🔧 Admin APIs

### Calendar Retry
```http
POST /api/admin/calendar-retry
```

**Description**: Retry failed calendar operations.

**Authentication**: Required (admin)

**Request Body**:
```json
{
  "operationType": "create" | "update" | "delete",
  "bookingId": "booking-uuid-123",
  "retryCount": 1
}
```

**Response**:
```json
{
  "success": true,
  "calendarEventId": "cal-event-789",
  "retryAttempt": 2,
  "message": "Calendar event created successfully"
}
```

## 🚨 Error Handling

### Standard Error Response Format
```typescript
interface ErrorResponse {
  error: string;                   // Error message
  code?: string;                   // Error code
  details?: any;                   // Additional error details
  timestamp: string;               // ISO timestamp
  path: string;                    // Request path
}
```

### Common HTTP Status Codes

#### 2xx Success
- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **202 Accepted**: Request accepted for processing

#### 4xx Client Errors
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (e.g., booking slot unavailable)
- **422 Unprocessable Entity**: Validation errors
- **429 Too Many Requests**: Rate limit exceeded

#### 5xx Server Errors
- **500 Internal Server Error**: Unexpected server error
- **502 Bad Gateway**: External service error
- **503 Service Unavailable**: Service temporarily unavailable

### Error Examples

#### Validation Error (400)
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fields": {
      "email": "Invalid email format",
      "date": "Date must be in the future"
    }
  },
  "timestamp": "2024-01-20T10:30:00Z",
  "path": "/api/bookings/create"
}
```

#### Authentication Error (401)
```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED",
  "timestamp": "2024-01-20T10:30:00Z",
  "path": "/api/vip/profile"
}
```

#### Resource Not Found (404)
```json
{
  "error": "Booking not found",
  "code": "BOOKING_NOT_FOUND",
  "details": {
    "bookingId": "booking-invalid-123"
  },
  "timestamp": "2024-01-20T10:30:00Z",
  "path": "/api/vip/bookings/booking-invalid-123/modify"
}
```

#### Conflict Error (409)
```json
{
  "error": "Requested time slot is not available",
  "code": "SLOT_UNAVAILABLE",
  "details": {
    "date": "2024-01-20",
    "startTime": "14:00",
    "bay": "Bay 1",
    "alternativeTimes": ["15:00", "16:00"]
  },
  "timestamp": "2024-01-20T10:30:00Z",
  "path": "/api/bookings/create"
}
```

## 🔒 Rate Limiting

### Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705741800
```

### Rate Limit Configuration
- **General API**: 120 requests per minute
- **Booking Creation**: 10 requests per hour (authenticated), 3 per hour (guest)
- **Availability Checks**: 100 requests per minute
- **VIP Operations**: 60 requests per minute

### Rate Limit Response (429)
```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 100,
    "remaining": 0,
    "resetTime": "2024-01-20T10:30:00Z"
  },
  "timestamp": "2024-01-20T10:29:45Z",
  "path": "/api/availability"
}
```

## 📊 Response Caching

### Cache Headers
```http
Cache-Control: public, max-age=300
ETag: "abc123def456"
Last-Modified: Sat, 20 Jan 2024 10:00:00 GMT
```

### Caching Strategy
- **Availability Data**: 5 minutes
- **VIP Profile**: 3 minutes
- **VIP Status**: 5 minutes
- **Package Data**: 5 minutes
- **Static Data**: 1 hour

## 🔍 API Testing

### Example cURL Commands

#### Get VIP Profile
```bash
curl -X GET "https://len.golf/api/vip/profile" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Create Booking
```bash
curl -X POST "https://len.golf/api/bookings/create" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-20",
    "startTime": "14:00",
    "duration": 2,
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "0812345678",
    "numberOfPeople": 2
  }'
```

#### Check Availability
```bash
curl -X GET "https://len.golf/api/availability?date=2024-01-20" \
  -H "Content-Type: application/json"
```

This comprehensive API reference provides complete documentation for all endpoints in the Lengolf Booking Refactor system, enabling developers to integrate and extend the platform effectively. 