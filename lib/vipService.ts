import {
  VipStatusResponse,
  LinkAccountRequest,
  LinkAccountSuccessResponse,
  VipProfileResponse,
  UpdateVipProfileRequest,
  UpdateVipProfileResponse,
  GetVipBookingsParams,
  VipBookingsResponse,
  ModifyVipBookingRequest,
  ModifyVipBookingResponse,
  CancelVipBookingRequest,
  CancelVipBookingResponse,
  VipPackagesResponse,
  ApiErrorPayload,
  VipApiError,
} from '../types/vip';

const VIP_API_BASE_URL = '/api/vip';

async function fetchVipApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const startTime = performance.now();
  const { headers, ...restOptions } = options;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  try {
    const response = await fetch(`${VIP_API_BASE_URL}${endpoint}`, {
      ...restOptions,
      headers: defaultHeaders,
    });

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log slow API calls for monitoring (over 1 second)
    if (duration > 1000) {
      console.warn(`[VIP API Performance] Slow request to ${endpoint}: ${duration.toFixed(2)}ms`);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[VIP API Performance] ${endpoint}: ${duration.toFixed(2)}ms`);
    }

    if (!response.ok) {
      let errorPayload: ApiErrorPayload | undefined;
      try {
        errorPayload = await response.json();
      } catch (e) {
        // Ignore if response is not JSON or empty
      }
      
      // Handle force logout scenarios (e.g., stale session)
      if (response.status === 401 && errorPayload && 'forceLogout' in errorPayload) {
        console.warn('[VIP API] Force logout requested due to stale session');
        // Import signOut dynamically to avoid circular dependencies
        import('next-auth/react').then(({ signOut }) => {
          signOut({ callbackUrl: '/auth/login' });
        });
      }
      
      throw new VipApiError(
        errorPayload?.message || errorPayload?.error || `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorPayload
      );
    }

    if (response.status === 204) { // No Content
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.error(`[VIP API Error] ${endpoint} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

export async function getVipStatus(): Promise<VipStatusResponse> {
  return fetchVipApi<VipStatusResponse>('/status');
}

export async function linkAccount(data: LinkAccountRequest): Promise<LinkAccountSuccessResponse> {
  return fetchVipApi<LinkAccountSuccessResponse>('/link-account', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getVipProfile(): Promise<VipProfileResponse> {
  return fetchVipApi<VipProfileResponse>('/profile');
}

export async function updateVipProfile(data: UpdateVipProfileRequest): Promise<UpdateVipProfileResponse> {
  return fetchVipApi<UpdateVipProfileResponse>('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getVipBookings(params?: GetVipBookingsParams): Promise<VipBookingsResponse> {
  let endpoint = '/bookings';
  if (params) {
    const queryParams = new URLSearchParams();
    if (params.page !== undefined) queryParams.append('page', String(params.page));
    if (params.limit !== undefined) queryParams.append('limit', String(params.limit));
    if (params.filter) queryParams.append('filter', params.filter);
    if (queryParams.toString()) {
      endpoint += `?${queryParams.toString()}`;
    }
  }
  return fetchVipApi<VipBookingsResponse>(endpoint);
}

export async function modifyVipBooking(bookingId: string, data: ModifyVipBookingRequest): Promise<ModifyVipBookingResponse> {
  return fetchVipApi<ModifyVipBookingResponse>(`/bookings/${bookingId}/modify`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function cancelVipBooking(bookingId: string, data?: CancelVipBookingRequest): Promise<CancelVipBookingResponse> {
  return fetchVipApi<CancelVipBookingResponse>(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined, // Optional body
  });
}

export async function getVipPackages(): Promise<VipPackagesResponse> {
  return fetchVipApi<VipPackagesResponse>('/packages');
} 