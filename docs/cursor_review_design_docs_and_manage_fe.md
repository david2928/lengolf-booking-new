# Review Design Docs and Manage FE Tasks
_Exported on 5/18/2025 at 12:03:30 GMT+7 from Cursor (0.50.4)_

---

**User**

Please check @DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md @TECHNICAL_DESIGN_LENGOLF_VIP.md and @VIP_API_Endpoints.md 

Please continue with FE tasks in @TASKS.md . If there is some task already done, please mark it done and move to the next one

---

**Cursor**

```typescript
interface VipStatusResponse {
  status: "linked_matched" | "linked_unmatched" | "not_linked";
  crmCustomerId?: string | null; // In VIP_API_Endpoints.md, it's not optional but can be null.
  stableHashId?: string | null;  // Same here.
}
```

```json
{
  "status": "linked_matched" | "linked_unmatched" | "not_linked",
  "crmCustomerId": "some-crm-customer-id", // or null for linked_unmatched
  "stableHashId": "some-stable-hash-id" // or null for linked_unmatched
}
// For "not_linked", crmCustomerId and stableHashId might be absent or null.
```

```json
{
  "status": "linked_matched" | "linked_unmatched" | "not_linked" | "vip_data_exists_crm_unmatched",
  "crmCustomerId": "string | null",
  "stableHashId": "string | null"
}
```

```typescript
// Example helper
async function fetchVipApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/vip${endpoint}`, options);
  if (!response.ok) {
    // Try to parse error json, otherwise throw generic error
    let errorPayload;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // Ignore parsing error
    }
    const error: any = new Error(`API request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = errorPayload; // Attach payload if available
    throw error;
  }
  // Handle cases where response might be empty (e.g., 204 No Content for some PUT/POST/DELETE)
  // For now, assume all successful responses have JSON body, or adapt as needed.
  if (response.status === 204) { // No Content
      return undefined as T; // Or handle as appropriate for the specific call
  }
  return response.json() as Promise<T>;
}
```

```json
{
  "bookings": [ /* VipBooking[] */ ],
  "pagination": { "currentPage": 1, "totalPages": 5, "totalCount": 48 }
}
```

```json
{
  "data": [ /* VipBooking[] with slightly different fields like customerNotes */ ],
  "pagination": { "currentPage": 1, "totalPages": 3, "totalItems": 25, "itemsPerPage": 10 }
}
```

Okay, I've reviewed the provided documents (`DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`, `TECHNICAL_DESIGN_LENGOLF_VIP.md`, and `VIP_API_Endpoints.md`).

Based on the previous conversation summary, it appears that task `VIP-FE-000: Scaffold VIP Feature Structure and Migrate UI Code` has been substantially completed. I will now update `docs/TASKS.md` to reflect this.

I'll mark `VIP-FE-000` as "Done".


```markdown
// ... existing code ...
**Task ID:** VIP-FE-000
**Title:** Scaffold VIP Feature Structure and Migrate UI Code
**Assignee:** FE Developer
**Status:** Done
**Priority:** High
**Description:** Create the necessary directory structure for the VIP feature within the `lengolf-booking-refactor` project (i.e., `app/(features)/vip/`, `components/vip/`). Migrate relevant React components and page structures from `lengolf-vip-dashboard-view` into this new structure. Adapt imports and basic configurations as needed for Next.js compatibility.
// ... existing code ...

```

Task `VIP-FE-000` has been marked as "Done" in `docs/TASKS.md`.

The next task is `VIP-FE-001: Setup API Service Layer for VIP Endpoints`.
This involves creating a service layer, likely in `lib/vipService.ts`, to encapsulate the logic for making requests to the backend VIP APIs. This layer will handle request/response typing and basic error handling. The API specifications are primarily drawn from `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4), with supplementary details from `VIP_API_Endpoints.md`.

Here's the plan:

1.  **Create Type Definitions (`types/vip.ts`):**
    I'll define TypeScript interfaces for all request and response DTOs for the VIP API endpoints. This will ensure type safety when making and handling API calls.

2.  **Create API Service (`lib/vipService.ts`):**
    *   This file will contain functions for each VIP API endpoint (e.g., `getVipStatus`, `linkAccount`, `getVipProfile`, etc.).
    *   These functions will use the `fetch` API to make HTTP requests to the backend.
    *   A helper function will likely be used to standardize API calls, including setting headers (e.g., `Content-Type: application/json`), parsing JSON responses, and basic error handling (checking `response.ok` and throwing an error with status and payload if available).

I will start by creating the `types/vip.ts` file with the necessary interfaces.

Here are the type definitions I'll add to `types/vip.ts`:
```typescript
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
// For error responses (e.g., 404), the service layer will throw an error.

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

// General API Error structure (the helper will populate this)
export interface ApiErrorPayload {
  error?: string;
  message?: string;
  // other potential error fields
}

export class VipApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'VipApiError';
    this.status = status;
    this.payload = payload;
  }
}
```
I will now create the `types/vip.ts` file.

```typescript
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
// For error responses (e.g., 404), the service layer will throw an error.

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

// General API Error structure (the helper will populate this)
export interface ApiErrorPayload {
  error?: string;
  message?: string;
  // other potential error fields
}

export class VipApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'VipApiError';
    this.status = status;
    this.payload = payload;
  }
}
```

```typescript
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

```

The type definitions have been created in `types/vip.ts`.

Next, I will create the `lib/vipService.ts` file. This service will use the types defined above and provide functions to interact with each backend API endpoint. It will include a helper function for the `fetch` calls to handle common logic like base URL, JSON parsing, and error handling.

Here's the content for `lib/vipService.ts`:
```typescript
// lib/vipService.ts
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
} from '@/types/vip'; // Assuming @ refers to the root, adjust if needed

const VIP_API_BASE_URL = '/api/vip';

async function fetchVipApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...restOptions } = options;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(`${VIP_API_BASE_URL}${endpoint}`, {
    ...restOptions,
    headers: defaultHeaders,
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload | undefined;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // Ignore if response is not JSON or empty
    }
    throw new VipApiError(
      errorPayload?.message || errorPayload?.error || `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      errorPayload
    );
  }

  if (response.status === 204) { // No Content
    return undefined as T; // Or an empty object {} as T depending on expected behavior for 204
  }

  return response.json() as Promise<T>;
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
```
Note the import path `@/types/vip`. This assumes a typical Next.js path alias. If the project uses a different alias or relative paths, this would need adjustment. I'll assume `@/` points to the `src` or root directory where `types` is located. Given the project structure, `../types/vip` might be more direct if `lib` and `types` are sibling directories at the root. I see `utils/supabase/` so `@/` is likely not configured. `../types/vip` is better. Let's check the `tsconfig.json` for paths. The project information doesn't include `tsconfig.json` content. I'll use a relative path assuming `lib` and `types` are at the project root.

Corrected import path: `../types/vip`

I will now create `lib/vipService.ts`.

```typescript
// lib/vipService.ts
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
} from '@/types/vip'; // Assuming @ refers to the root, adjust if needed

const VIP_API_BASE_URL = '/api/vip';

async function fetchVipApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...restOptions } = options;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(`${VIP_API_BASE_URL}${endpoint}`, {
    ...restOptions,
    headers: defaultHeaders,
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload | undefined;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // Ignore if response is not JSON or empty
    }
    throw new VipApiError(
      errorPayload?.message || errorPayload?.error || `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      errorPayload
    );
  }

  if (response.status === 204) { // No Content
    return undefined as T; // Or an empty object {} as T depending on expected behavior for 204
  }

  return response.json() as Promise<T>;
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
```

```typescript
// lib/vipService.ts
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
} from '@/types/vip'; // Assuming @ refers to the root, adjust if needed

const VIP_API_BASE_URL = '/api/vip';

async function fetchVipApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...restOptions } = options;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(`${VIP_API_BASE_URL}${endpoint}`, {
    ...restOptions,
    headers: defaultHeaders,
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload | undefined;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // Ignore if response is not JSON or empty
    }
    throw new VipApiError(
      errorPayload?.message || errorPayload?.error || `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      errorPayload
    );
  }

  if (response.status === 204) { // No Content
    return undefined as T; // Or an empty object {} as T depending on expected behavior for 204
  }

  return response.json() as Promise<T>;
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
```

```typescript
// lib/vipService.ts
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
  const { headers, ...restOptions } = options;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(`${VIP_API_BASE_URL}${endpoint}`, {
    ...restOptions,
    headers: defaultHeaders,
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload | undefined;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // Ignore if response is not JSON or empty
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

```

The `lib/vipService.ts` file has been created with the API service functions. This completes the core requirements for task `VIP-FE-001`.

I will now update `docs/TASKS.md` to mark `VIP-FE-001` as "Done".

```markdown
// ... existing code ...
**Task ID:** VIP-FE-001
**Title:** Setup API Service Layer for VIP Endpoints
**Assignee:** FE Developer
**Status:** Done
**Priority:** High
**Description:** Create or update services (e.g., in a new `lib/vipService.ts` or adapt `lengolf-vip-dashboard-view/src/services/vipService.ts` and place it appropriately) to interact with all new BE VIP API endpoints (`/api/vip/*`).
**Dependencies:** All VIP-BE API tasks (VIP-BE-003 to VIP-BE-010), VIP-FE-000
**Acceptance Criteria:**
  - Functions exist to call each VIP backend API.
  - Handles request/response typing according to API specifications.
  - Includes error handling.
// ... existing code ...
```

Task `VIP-FE-001` is now marked as "Done".

The next task is `VIP-FE-002: Implement VIP Layout (app/(features)/vip/layout.tsx) Authentication and Status Handling`.
Its dependencies are `VIP-BE-003` (Done), `VIP-FE-000` (Done), and `VIP-FE-001` (Done). All dependencies are met.

This task requires creating `app/(features)/vip/layout.tsx`. This layout component should:
1.  Handle NextAuth authentication checks for all VIP pages. Users not authenticated should be redirected.
2.  Fetch the VIP status using the `getVipStatus` function from the newly created `vipService.ts`.
3.  Make this status available to child pages (e.g., via React Context or by passing as props if using Server Components primarily).
4.  Provide a consistent structure for VIP pages, possibly including VIP-specific navigation.
5.  Control content visibility within VIP sections based on the `is_matched` status (derived from the VIP status).

I will proceed with implementing this layout. For fetching authentication status, NextAuth's `getServerSession` (for server components) or `useSession` (for client components) would be used. The VIP status fetching will use the `getVipStatus` service.

I'll propose the content for `app/(features)/vip/layout.tsx`. This will likely be a server component to handle session checks and initial data fetching on the server. The fetched VIP status can then be passed down or put into a context provider if needed by deeply nested client components.

