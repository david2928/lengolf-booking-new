// types/vip.ts

// 1. GET /api/vip/status
export interface VipStatusResponse {
  status: "linked_matched" | "linked_unmatched" | "not_linked" | "vip_data_exists_crm_unmatched";
  crmCustomerId: string | null;
}

// 2. POST /api/vip/link-account
export interface LinkAccountRequest {
  phoneNumber: string;
}

export interface LinkAccountSuccessResponse {
  message: string;
  status: "linked_matched";
  crmCustomerId: string;
}

// 3. GET /api/vip/profile
export interface VipTierInfo {
  id: number;
  name: string;
  description: string | null;
}

export interface VipProfileResponse {
  id: string; // profile_id from profiles
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  pictureUrl: string | null;
  marketingPreference: boolean | null;
  customerStatus: "linked" | "not_linked";
  customerCode: string | null;
  vipTier: VipTierInfo | null;
  dataSource?: string;
}

// 4. PUT /api/vip/profile
export interface UpdateVipProfileRequest {
  display_name?: string;
  email?: string;
  marketingPreference?: boolean;
}

export interface UpdateVipProfileResponse {
  success: boolean;
  message: string;
  updatedFields: string[];
}

// 5. GET /api/vip/bookings
export interface GetVipBookingsParams {
  page?: number;
  limit?: number;
  filter?: "future" | "past" | "all";
}

export interface VipBooking {
  id: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  duration: number; // hours
  bay: string;
  status: "confirmed" | "cancelled" | "completed";
  numberOfPeople: number;
  notes?: string;
  bookingType?: string | null;
  createdAt?: string;
}

export interface VipBookingsResponse {
  bookings: VipBooking[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
  };
}

// 6. PUT /api/vip/bookings/{bookingId}/modify
/**
 * Every field is optional: the endpoint is a sparse patch, so a customer who
 * only moves the time does not have to echo back their guest count.
 *
 * Keys are snake_case to match the wire format the route actually reads. They
 * used to be camelCase here while the route read snake_case, so anything typed
 * against this interface silently failed to change the time — the mismatch
 * survived because nothing ever called it.
 *
 * `bay` is deliberately absent. Customers pick a bay *type* at creation, never a
 * specific bay, and the edit endpoint reassigns within that type itself.
 */
export interface ModifyVipBookingRequest {
  date?: string; // yyyy-MM-dd
  start_time?: string; // HH:mm
  duration?: number; // hours
  number_of_people?: number;
  customer_notes?: string | null;
}

/** One field the edit actually changed, for the confirmation screen. */
export interface VipBookingChange<T> {
  from: T;
  to: T;
}

/**
 * Only fields that CHANGED appear. The review screen renders old → new from
 * this rather than diffing two snapshots client-side, so the server stays the
 * single authority on what happened — including the bay, which the customer
 * never chose and may not expect to have moved.
 */
export interface ModifyVipBookingChanges {
  date?: VipBookingChange<string>;
  start_time?: VipBookingChange<string>;
  duration?: VipBookingChange<number>;
  bay?: VipBookingChange<string | null>;
  number_of_people?: VipBookingChange<number | null>;
  customer_notes?: VipBookingChange<string | null>;
}

export interface ModifyVipBookingResponse {
  success: boolean;
  booking: VipBooking;
  changes: ModifyVipBookingChanges;
}

/**
 * Machine-readable failure reasons. The UI maps these to translated copy, so a
 * customer sees why the slot was refused instead of a generic error.
 */
export type ModifyVipBookingErrorCode =
  | 'NO_FIELDS'
  | 'VALIDATION_ERROR'
  | 'NEW_TIME_IN_PAST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'ACCOUNT_NOT_LINKED'
  | 'NOT_FOUND'
  | 'NOT_CONFIRMED'
  | 'BOOKING_IN_PAST'
  | 'TOO_LATE_TO_EDIT'
  | 'COACHING_NOT_EDITABLE'
  | 'SLOT_UNAVAILABLE'
  | 'CLUB_SET_UNAVAILABLE'
  | 'PACKAGE_EXPIRED'
  | 'CREDIT_INVARIANT'
  | 'DURATION_LOCKED'
  | 'STATE_CHANGED'
  | 'INTERNAL';

// 7. POST /api/vip/bookings/{bookingId}/cancel
export interface CancelVipBookingRequest {
  cancellation_reason?: string;
}

export interface CancelVipBookingResponse {
  success: boolean;
}

// 8. GET /api/vip/packages
export interface VipPackage {
  id: string;
  crm_package_id?: string;
  packageName: string; // Main name, e.g., "Gold (30H)" or "Gold"
  package_display_name?: string; // e.g., "Gold"
  package_type_name?: string; // Raw field from one of the tables, maybe for specific reference
  packageCategory?: "Monthly" | "Coaching" | "Unlimited" | string; // From pt.type
  
  purchaseDate: string | null; // yyyy-MM-dd or full timestamp string
  first_use_date?: string | null;
  expiryDate: string | null;
  
  totalHours?: number | null; // From pt.hours
  remainingHours?: number | null;
  usedHours?: number | null;
  remainingSessions?: number; // Keep if some packages are session-based from another source
  
  pax?: number | null; // From pt.pax
  validityPeriod?: string | null; // Formatted string like "6 months"

  customer_name?: string; // If still needed
  status: "active" | "depleted" | "expired" | string; // More reliable status from API
}

export interface VipPackagesResponse {
  activePackages: VipPackage[];
  pastPackages: VipPackage[];
}

// General API Error structure
export interface ApiErrorPayload {
  error?: string;
  message?: string;
  /**
   * Machine-readable reason, where the route supplies one.
   *
   * `GUEST_SESSION_NOT_ELIGIBLE` is the only value today: a guest session is
   * authenticated but not proof of identity (lib/auth/vip-access.ts), so the
   * VIP routes 403 it. The VIP layout keys off this to offer sign-in rather
   * than render a generic error, which for a guest is both wrong and a dead
   * end — signing in again as a guest cannot help.
   */
  code?: string;
  // other potential error fields from backend
}

export class VipApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'VipApiError';
    this.status = status;
    this.payload = payload;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, VipApiError.prototype);
  }
} 