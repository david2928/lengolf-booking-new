// types/vip.ts

// 1. GET /api/vip/status
export interface VipStatusResponse {
  status: "linked_matched" | "linked_unmatched" | "not_linked" | "vip_data_exists_crm_unmatched";
  crmCustomerId: string | null;
  stableHashId: string | null;
}

// 2. POST /api/vip/link-account
export interface LinkAccountRequest {
  phoneNumber: string;
}

export interface LinkAccountSuccessResponse {
  message: string;
  status: "linked_matched";
  crmCustomerId: string;
  stableHashId: string;
}

// 3. GET /api/vip/profile
export interface VipTierInfo {
  id: number;
  name: string;
  description: string | null;
}

export interface VipProfileResponse {
  id: string; // profile_id from profiles_vip_staging
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  pictureUrl: string | null;
  marketingPreference: boolean | null;
  crmStatus: "linked_matched" | "linked_unmatched" | "not_linked" | "vip_data_exists_crm_unmatched";
  crmCustomerId: string | null;
  stableHashId: string | null;
  vipTier: VipTierInfo | null;
}

// 4. PUT /api/vip/profile
export interface UpdateVipProfileRequest {
  display_name?: string;
  email?: string;
  marketingPreference?: boolean;
  vip_phone_number?: string | null;
}

export interface UpdateVipProfileResponse {
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
export interface ModifyVipBookingRequest {
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  duration: number; // hours
}

export interface ModifyVipBookingResponse {
  success: boolean;
  updatedBooking: VipBooking;
}

// 7. POST /api/vip/bookings/{bookingId}/cancel
export interface CancelVipBookingRequest {
  cancellationReason?: string;
}

export interface CancelVipBookingResponse {
  success: boolean;
}

// 8. GET /api/vip/packages
export interface VipPackage {
  id: string;
  packageName: string;
  purchaseDate: string; // yyyy-MM-dd
  expiryDate: string | null; // yyyy-MM-dd
  totalSessions: number;
  remainingSessions: number;
  status: "active" | "depleted" | "expired";
}

export interface VipPackagesResponse {
  activePackages: VipPackage[];
  pastPackages: VipPackage[];
}

// General API Error structure
export interface ApiErrorPayload {
  error?: string;
  message?: string;
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