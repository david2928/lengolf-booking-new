# LINE Self-Service Customer Linking

**Feature Request**: Enable customers to link their LINE account to their customer profile via phone number in the LIFF app (Lucky Draw page).

**Created**: December 2025
**Status**: Proposed
**Projects**: lengolf-forms (backend), lengolf-booking-new (LIFF frontend)

---

## 🎯 Problem Statement

### Current Situation

**LINE User Linking Requires Manual Staff Action:**
1. Customer pays at POS and wants to redeem Lucky Draw rewards
2. Customer opens LIFF app (Lucky Draw page)
3. System checks: Is this LINE user linked to a customer?
4. **If NOT linked:**
   - Customer sees: "Account not linked" or similar error
   - Customer must ask staff for help
   - Staff opens customer modal → searches for LINE user → manually links
   - Customer can finally access Lucky Draw

**Why This Is Problematic:**
- ❌ Requires staff intervention (slows down redemption)
- ❌ Poor customer experience (friction in reward redemption)
- ❌ Only works if customer already added LINE account
- ❌ Staff must be available to help
- ❌ Doesn't scale during busy periods

### LINE User Availability Constraint

**Important Limitation:**
- LINE users only appear in the `line_users` table **after they interact** with your LINE Official Account
- They must either:
  1. ✅ Add your LINE Official Account as a friend (follow event)
  2. ✅ Send any message to your account
  3. ✅ Click a button/menu in your LINE interface
- You **CANNOT**:
  - ❌ Get a list of all LINE users
  - ❌ Message users who haven't added your account
  - ❌ Search LINE's user database

**This means:** The customer must have already added your LINE account for any linking to work (manual or self-service).

---

## 💡 Proposed Solution

### Self-Service Phone-Based Linking

Allow customers to link their own LINE account by entering their phone number in the LIFF app.

**New Customer Journey:**
1. Customer opens LIFF app (Lucky Draw page)
2. System checks if LINE user is linked to a customer
3. **If NOT linked:**
   - Show: "Link Your Account" screen
   - Customer enters phone number (e.g., "0812345678")
   - System searches `customers` table by normalized phone number
   - **If found:** Auto-link LINE user → customer → redirect to Lucky Draw ✅
   - **If not found:** Show fallback message: "We couldn't find your account. Please send us a message or visit our counter"

**Benefits:**
- ✅ **Self-service** - No staff intervention needed
- ✅ **Fast** - Instant linking for existing customers
- ✅ **Better UX** - Frictionless reward redemption
- ✅ **Scalable** - Works during peak hours
- ✅ **Leverages existing data** - Uses phone numbers already in system

---

## 🏗️ Existing Infrastructure (lengolf-forms)

### ✅ Customer Matching Service Already Exists!

**File:** `src/lib/customer-mapping-service.ts`

The `CustomerMappingService` class already implements sophisticated customer matching:

#### Matching Strategy (in priority order):
1. **Phone Number** (Primary) - Normalized phone matching
2. **Fuzzy Name** (Secondary) - >90% similarity required
3. **Email** (Tertiary) - Exact email matching

#### Phone Normalization Logic
```typescript
normalizePhoneNumber(phone: string): string | null {
  // Remove all non-digit characters
  let normalized = phone.replace(/[^0-9]/g, '');

  // Remove country code +66 (Thailand)
  if (normalized.length >= 11 && normalized.startsWith('66')) {
    normalized = normalized.substring(2);
  }

  // Remove leading 0 for local numbers
  if (normalized.length === 10 && normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }

  // Return last 9 digits for matching
  return normalized.slice(-9);
}
```

**Examples:**
- Input: `0812345678` → Output: `812345678`
- Input: `+66812345678` → Output: `812345678`
- Input: `66812345678` → Output: `812345678`
- Input: `08-1234-5678` → Output: `812345678`

#### Existing API Endpoint

**File:** `app/api/customers/match/route.ts`

```typescript
POST /api/customers/match

Request Body:
{
  phone?: string,
  customerName?: string,
  email?: string
}

Response:
{
  match: {
    id: string,
    customer_code: string,
    customer_name: string,
    contact_number: string,
    email?: string,
    normalized_phone: string,
    match_method: 'phone' | 'name' | 'email'
  } | null,
  found: boolean,
  matchMethod: 'phone' | 'name' | 'email' | null
}
```

**Usage Example:**
```typescript
// lengolf-booking-new (LIFF app) would call this:
const response = await fetch('https://your-domain.com/api/customers/match', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0812345678' })
});

const { match, found } = await response.json();

if (found) {
  // Customer found! Now link LINE user to this customer
  await linkLineUserToCustomer(liff.getContext().userId, match.id);
} else {
  // No customer found - show fallback message
}
```

---

## 🚀 Implementation Guide

### Step 1: New API Endpoint (lengolf-forms)

**File:** `app/api/line/users/link-by-phone/route.ts` (NEW)

**Purpose:** Link LINE user to customer by phone number

```typescript
POST /api/line/users/link-by-phone

Request Body:
{
  lineUserId: string,   // From liff.getContext().userId
  phoneNumber: string   // User input
}

Response (Success):
{
  success: true,
  matched: true,
  customer: {
    id: string,
    customer_code: string,
    customer_name: string,
    contact_number: string
  }
}

Response (Not Found):
{
  success: true,
  matched: false,
  message: "No customer found with that phone number"
}

Response (Error):
{
  success: false,
  error: string
}
```

**Implementation Logic:**
1. Validate phone number format
2. Call `customerMappingService.findByNormalizedPhone(phoneNumber)`
3. If customer found:
   - Call existing LINE linking logic (reuse `/api/line/users/[lineUserId]/link-customer`)
   - Updates `line_users.customer_id`
   - Updates `customers.customer_profiles` JSONB
   - Upserts `profiles` table for Lucky Draw compatibility
4. If not found:
   - Return `matched: false` with friendly message
5. Error handling for edge cases

**Pseudocode:**
```typescript
export async function POST(request: NextRequest) {
  try {
    const { lineUserId, phoneNumber } = await request.json();

    // Validate inputs
    if (!lineUserId || !phoneNumber) {
      return NextResponse.json({
        success: false,
        error: "Missing lineUserId or phoneNumber"
      }, { status: 400 });
    }

    // Find customer by phone
    const customerMatch = await customerMappingService.findByNormalizedPhone(phoneNumber);

    if (!customerMatch) {
      return NextResponse.json({
        success: true,
        matched: false,
        message: "We couldn't find your account. Please visit our counter or send us a message."
      });
    }

    // Customer found - link LINE user
    // Reuse existing linking logic from /api/line/users/[lineUserId]/link-customer
    const linkResult = await linkLineUserToCustomer(lineUserId, customerMatch.id);

    if (!linkResult.success) {
      return NextResponse.json({
        success: false,
        error: linkResult.error
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      matched: true,
      customer: {
        id: customerMatch.id,
        customer_code: customerMatch.customer_code,
        customer_name: customerMatch.customer_name,
        contact_number: customerMatch.contact_number
      }
    });

  } catch (error) {
    console.error('Error linking by phone:', error);
    return NextResponse.json({
      success: false,
      error: "Internal server error"
    }, { status: 500 });
  }
}
```

---

### Step 2: LIFF App Integration (lengolf-booking-new)

**Location:** Lucky Draw page or new "Link Account" page

#### UI Components Needed

**1. Link Account Screen (when not linked):**

```tsx
// Example component structure
function LinkAccountScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLink = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/line/users/link-by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: liff.getContext().userId,
          phoneNumber: phoneNumber
        })
      });

      const data = await response.json();

      if (data.success && data.matched) {
        // Success! Linked successfully
        router.push('/lucky-draw'); // Or refresh to show Lucky Draw
      } else if (data.success && !data.matched) {
        // No customer found
        setError(data.message);
      } else {
        // Error
        setError(data.error || 'Failed to link account');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Link Your Account</h2>
      <p className="text-gray-600 mb-6">
        Enter your phone number to access Lucky Draw rewards
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Phone Number
        </label>
        <input
          type="tel"
          placeholder="08XXXXXXXX"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleLink}
        disabled={loading || !phoneNumber}
        className="w-full bg-green-500 text-white py-3 rounded-lg font-medium disabled:opacity-50"
      >
        {loading ? 'Linking...' : 'Link Account'}
      </button>

      <p className="text-xs text-gray-500 mt-4 text-center">
        Haven't registered? Visit our counter to create an account.
      </p>
    </div>
  );
}
```

**2. Fallback Message (if no match):**

```tsx
function NoMatchFoundScreen() {
  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <div className="mb-4">
        <svg className="w-16 h-16 mx-auto text-gray-400" /* Icon */ />
      </div>

      <h2 className="text-xl font-bold mb-2">Account Not Found</h2>

      <p className="text-gray-600 mb-6">
        We couldn't find an account with that phone number.
      </p>

      <div className="space-y-3">
        <button className="w-full bg-green-500 text-white py-3 rounded-lg">
          Send us a LINE message
        </button>

        <button className="w-full border border-gray-300 py-3 rounded-lg">
          Visit our counter
        </button>

        <button
          onClick={() => router.back()}
          className="w-full text-gray-600 py-2"
        >
          Try different number
        </button>
      </div>
    </div>
  );
}
```

#### Page Flow Logic

```typescript
// Lucky Draw page or Link Account page
function LuckyDrawPage() {
  const [lineProfile, setLineProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkLinkStatus() {
      const userId = liff.getContext().userId;

      // Check if LINE user is linked
      const response = await fetch(`/api/line/profiles/${userId}`);
      const data = await response.json();

      setLineProfile(data.profile);
      setLoading(false);
    }

    checkLinkStatus();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  // Not linked - show link account screen
  if (!lineProfile?.customer_id) {
    return <LinkAccountScreen />;
  }

  // Linked - show Lucky Draw
  return <LuckyDrawInterface customer={lineProfile.customer} />;
}
```

---

## 🔐 Security & Privacy Considerations

### 1. Phone Number Validation
- Client-side: Format validation (must be Thai phone number)
- Server-side: Normalize and validate before lookup
- Reject obviously invalid inputs

### 2. Rate Limiting
- Limit attempts per LINE user (e.g., 5 attempts per 15 minutes)
- Prevent brute-force phone number guessing
- Log failed attempts for monitoring

### 3. Privacy Protection
- **DO NOT** reveal if a phone number exists in the system
- Generic error: "We couldn't find your account" (not "Phone number not found")
- Prevents customer data enumeration

### 4. Additional Verification (Optional Enhancement)
If you want stronger security, add secondary verification:
- Ask for last 4 digits of phone + first name
- Example: "Phone: 0812345678, Name: John"
- Reduces risk of accidental wrong linking

---

## 🎨 User Experience Flow

### Happy Path (Customer Found)
```
┌─────────────────────────────────┐
│  Customer opens LIFF app        │
│  (Lucky Draw page)              │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Check: Is LINE user linked?    │
└──────────┬──────────────────────┘
           │
           ▼ (Not linked)
┌─────────────────────────────────┐
│  Show: "Link Your Account"      │
│  Enter phone number input       │
└──────────┬──────────────────────┘
           │
           ▼ (User enters: 0812345678)
┌─────────────────────────────────┐
│  API: POST /link-by-phone       │
│  Normalize: 812345678           │
│  Search customers table         │
└──────────┬──────────────────────┘
           │
           ▼ (Match found!)
┌─────────────────────────────────┐
│  Link LINE user to customer     │
│  Update line_users.customer_id  │
│  Update customer_profiles JSONB │
│  Upsert profiles table          │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Success! Show Lucky Draw       │
│  Customer can redeem rewards ✅ │
└─────────────────────────────────┘
```

### Unhappy Path (Customer Not Found)
```
┌─────────────────────────────────┐
│  User enters: 0999999999        │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  API: No customer found         │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Show: "Account Not Found"      │
│  Options:                       │
│  - Send us a message            │
│  - Visit counter                │
│  - Try different number         │
└─────────────────────────────────┘
```

---

## 📋 Implementation Checklist

### Backend (lengolf-forms)
- [ ] Create `/api/line/users/link-by-phone/route.ts`
- [ ] Implement phone validation logic
- [ ] Reuse existing `customerMappingService.findByNormalizedPhone()`
- [ ] Reuse existing LINE linking logic
- [ ] Add rate limiting middleware
- [ ] Add error logging
- [ ] Write unit tests for edge cases
- [ ] Document API endpoint in API reference

### Frontend (lengolf-booking-new)
- [ ] Create Link Account UI component
- [ ] Add phone number input with validation
- [ ] Implement linking API call
- [ ] Add loading states
- [ ] Add error handling
- [ ] Create fallback/no-match screen
- [ ] Add success animation/confirmation
- [ ] Test on mobile devices
- [ ] Add analytics tracking

### Testing
- [ ] Test phone normalization edge cases
- [ ] Test with existing customers
- [ ] Test with non-existent phone numbers
- [ ] Test multiple phone formats (with/without spaces, dashes, +66)
- [ ] Test rate limiting
- [ ] Test error scenarios
- [ ] Test on various mobile devices

---

## 🚨 Edge Cases & Considerations

### 1. Multiple Customers with Same Phone Number
**Scenario:** Two customers share a phone (family members)

**Options:**
- **A. Link to most recent:** Use `ORDER BY created_at DESC LIMIT 1`
- **B. Show selection UI:** Let user choose which account
- **C. Require additional info:** Ask for name + phone

**Recommendation:** Start with Option A (most recent), add Option B if needed

### 2. Customer Changed Phone Number
**Scenario:** Customer's phone number in system is outdated

**Fallback:** Customer contacts staff or sends LINE message for manual linking

### 3. New Customers (Not in System Yet)
**Scenario:** Customer tries to link but hasn't registered at counter

**Flow:**
1. Phone number not found
2. Show: "Account not found. Please visit our counter to register."
3. Optional: Add "Create Account" form in LIFF (future enhancement)

### 4. LINE User Already Linked to Different Customer
**Scenario:** User tries to link but LINE account already linked

**Response:**
```json
{
  "success": false,
  "error": "This LINE account is already linked to another customer. Please contact staff if this is incorrect."
}
```

---

## 📊 Expected Impact

### Before Self-Service Linking
- Customer opens LIFF → Account not linked → Asks staff → Staff manually links → Customer accesses Lucky Draw
- **Time:** 2-5 minutes
- **Staff involvement:** Required
- **Customer satisfaction:** ⭐⭐⭐

### After Self-Service Linking
- Customer opens LIFF → Enters phone → Auto-linked → Accesses Lucky Draw
- **Time:** 10-30 seconds
- **Staff involvement:** None
- **Customer satisfaction:** ⭐⭐⭐⭐⭐

### Metrics to Track
- % of successful self-service links
- Average time to link
- Number of "not found" cases
- Reduction in staff linking actions

---

## 🔗 Related Documentation

- **Customer Mapping Service:** `src/lib/customer-mapping-service.ts`
- **Customer Match API:** `app/api/customers/match/route.ts`
- **LINE User Linking API:** `app/api/line/users/[lineUserId]/link-customer/route.ts`
- **Staff LINE Linking UI:** `src/components/admin/customers/line-user-search-select.tsx`
- **Database Schema:** `docs/database/PUBLIC_SCHEMA_DOCUMENTATION.md`

---

## 💬 Questions & Answers

**Q: What if customer doesn't have LINE yet?**
A: They must add your LINE Official Account first. This is a LINE platform requirement - you cannot link users who haven't interacted with your account.

**Q: Can we skip phone number and auto-link by name?**
A: Not recommended. Name matching requires >90% similarity and could link wrong customer. Phone number is more reliable.

**Q: What about customers without phone numbers?**
A: Fallback to staff manual linking (existing flow). Phone number is required in your system for customer registration.

**Q: Should we require additional verification beyond phone?**
A: Start with phone-only for best UX. Add verification (name, last 4 digits) only if fraud becomes an issue.

---

## ✅ Next Steps

1. **Decision:** Approve this approach?
2. **Backend:** Implement `/api/line/users/link-by-phone` endpoint
3. **Frontend:** Implement Link Account screen in LIFF app
4. **Testing:** Test with real data on staging
5. **Deploy:** Roll out to production
6. **Monitor:** Track success rate and adjust as needed

---

**Document Version:** 1.0
**Last Updated:** December 7, 2025
**Author:** Claude Code
