# LENGOLF AI Lab Bay Implementation Plan

## Executive Summary
Adding Bay 4 as "LENGOLF AI Lab" to the booking system, differentiating it from the existing three "Social Bays" (Bay 1-3). The implementation will maintain the simple booking flow while clearly distinguishing bay types and guiding customers to appropriate selections.

## Current System Analysis

### Existing Infrastructure
- **Current Bays**: 
  - Bay 1 (Bar) - Social Bay
  - Bay 2 - Social Bay  
  - Bay 3 (Entrance) - Social Bay
  - Bay 4 - Already exists in database, needs to be branded as "LENGOLF AI Lab"

### Current Booking Flow
1. **Date Selection** → User selects date
2. **Time Slots** → Shows available times with max duration
3. **Booking Details** → User provides contact info, duration, number of people
4. **Confirmation** → Shows booking summary and sends notifications

### Key Components
- `app/(features)/bookings/components/booking/steps/TimeSlots.tsx` - Time slot selection
- `app/(features)/bookings/components/booking/steps/BookingDetails.tsx` - Booking form
- `lib/bayConfig.ts` - Bay configuration and display names
- `app/api/availability/route.ts` - Availability checking
- Database function: `get_available_slots_with_max_hours` - Currently only checks Bay 1-3

## Implementation Details

### Phase 1: Backend Updates

#### 1.1 Database Function Updates
**File**: Database function `get_available_slots_with_max_hours`

```sql
-- Add Bay 4 (AI Lab) availability check
-- Modify the function to check all 4 bays
-- Add bay type information to the response

-- Also need to update check_all_bays_availability function
-- to include Bay 4 in availability checks
```

#### 1.2 Create New RPC Function
**New Function**: `get_available_slots_with_bay_info`

```sql
-- Returns slots with additional bay type information
-- Includes which bays are available for each slot
-- Distinguishes between Social Bays and AI Lab
```

### Phase 2: Configuration Updates

#### 2.1 Bay Configuration
**File**: `lib/bayConfig.ts`

```typescript
export type BayType = 'social' | 'ai_lab';

export interface BayInfo {
  displayName: string;
  type: BayType;
  color: string;
  icon: string;
  maxRecommendedPeople?: number;
  experienceLevel?: 'all' | 'experienced';
  groupSize?: 'small' | 'large';
  leftHandedFriendly?: boolean;
  description?: string;
}

export const BAY_CONFIGURATION: Record<string, BayInfo> = {
  "Bay 1": {
    displayName: "Bay 1 (Bar)",
    type: "social",
    color: "green",
    icon: "users",
    experienceLevel: "all",
    groupSize: "large",
    description: "Social bay perfect for beginners and groups"
  },
  "Bay 2": {
    displayName: "Bay 2",
    type: "social", 
    color: "green",
    icon: "users",
    experienceLevel: "all",
    groupSize: "large",
    description: "Social bay perfect for beginners and groups"
  },
  "Bay 3": {
    displayName: "Bay 3 (Entrance)",
    type: "social",
    color: "green",
    icon: "users",
    experienceLevel: "all",
    groupSize: "large",
    description: "Social bay perfect for beginners and groups"
  },
  "Bay 4": {
    displayName: "LENGOLF AI Lab",
    type: "ai_lab",
    color: "purple",
    icon: "chip",
    maxRecommendedPeople: 2,
    experienceLevel: "experienced",
    leftHandedFriendly: true,
    description: "AI-powered swing analysis for experienced players"
  }
};

// Helper functions
export const getSocialBays = () => 
  Object.entries(BAY_CONFIGURATION)
    .filter(([_, info]) => info.type === 'social')
    .map(([key, _]) => key);

export const getAILabBays = () =>
  Object.entries(BAY_CONFIGURATION)
    .filter(([_, info]) => info.type === 'ai_lab')
    .map(([key, _]) => key);
```

### Phase 3: Frontend Components

#### 3.1 Time Slot Selection Enhancement
**File**: `app/(features)/bookings/components/booking/steps/TimeSlots.tsx`

**New Features**:
1. **Filter Toggle Component**
   ```typescript
   const BayTypeFilter = ({ selected, onChange }) => (
     <div className="flex gap-2 mb-6">
       <button onClick={() => onChange('all')} 
         className={selected === 'all' ? 'active' : ''}>
         All Bays
       </button>
       <button onClick={() => onChange('social')}
         className={selected === 'social' ? 'active' : ''}>
         Social Bays
       </button>
       <button onClick={() => onChange('ai_lab')}
         className={selected === 'ai_lab' ? 'active' : ''}>
         LENGOLF AI Lab
       </button>
     </div>
   );
   ```

2. **Enhanced Time Slot Display**
   - Add bay type badge (Social/AI Lab)
   - Show availability count: "Available: 2 of 3 Social Bays"
   - Add AI Lab recommendation: "⚡ Recommended for 1-2 experienced players"
   - Add left-handed friendly indicator: "👋 Left-handed friendly"
   - Different styling for AI Lab slots (purple accent)
   - Beginner recommendation for Social Bays: "👥 Perfect for beginners & groups"

3. **Slot Filtering Logic**
   ```typescript
   const filterSlotsByBayType = (slots, filterType) => {
     if (filterType === 'all') return slots;
     // Filter based on which bays are available for each slot
     return slots.filter(slot => {
       const availableBays = slot.availableBays;
       if (filterType === 'social') {
         return availableBays.some(bay => BAY_CONFIGURATION[bay].type === 'social');
       }
       return availableBays.some(bay => BAY_CONFIGURATION[bay].type === 'ai_lab');
     });
   };
   ```

#### 3.2 Booking Details Page Updates
**File**: `app/(features)/bookings/components/booking/steps/BookingDetails.tsx`

**Modifications**:
1. **Display Selected Bay Type**
   ```typescript
   // Add bay type display in header
   <div className="bg-purple-50 p-4 rounded-lg mb-4">
     <h3 className="font-bold text-purple-800">
       LENGOLF AI Lab Selected
     </h3>
     <p className="text-sm text-purple-600">
       AI-powered swing analysis and coaching
     </p>
   </div>
   ```

2. **Smart Warning for AI Lab**
   ```typescript
   {selectedBayType === 'ai_lab' && numberOfPeople >= 3 && (
     <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
       <p className="text-yellow-800">
         <strong>Note:</strong> The LENGOLF AI Lab is optimized for 1-2 experienced players 
         for the best experience. Social Bays are recommended for larger groups and beginners.
       </p>
       <button onClick={switchToSocialBay} className="text-yellow-600 underline">
         Switch to Social Bay
       </button>
     </div>
   )}
   
   {selectedBayType === 'ai_lab' && (
     <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg">
       <p className="text-sm text-purple-700">
         <strong>LENGOLF AI Lab</strong> features advanced swing analysis ideal for intermediate+ players 
         and includes left-handed player optimized setup.
       </p>
     </div>
   )}
   ```

#### 3.3 Bay Information Modal
**New File**: `app/(features)/bookings/components/BayInfoModal.tsx`

```typescript
export const BayInfoModal = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="max-w-4xl">
        <h2 className="text-2xl font-bold mb-6">
          Choose Your Experience
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Social Bays Section */}
          <div className="border-2 border-green-500 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <UsersIcon className="h-8 w-8 text-green-600 mr-3" />
              <h3 className="text-xl font-bold text-green-800">
                Social Bays
              </h3>
            </div>
            
            <div className="space-y-3">
              <p className="text-gray-700">Perfect for beginners, groups, and social play</p>
              
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>3 bays available</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>Groups up to 5 players</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>Perfect for beginners</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>All skill levels welcome</span>
                </li>
                <li className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>Play world-famous courses</span>
                </li>
              </ul>
              
              {/* Placeholder for image */}
              <div className="bg-gray-200 h-48 rounded-lg flex items-center justify-center">
                <span className="text-gray-500">Social Bay Image</span>
              </div>
            </div>
          </div>
          
          {/* AI Lab Section */}
          <div className="border-2 border-purple-500 rounded-lg p-6 relative">
            <div className="absolute -top-3 right-4 bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-bold">
              NEW!
            </div>
            
            <div className="flex items-center mb-4">
              <ChipIcon className="h-8 w-8 text-purple-600 mr-3" />
              <h3 className="text-xl font-bold text-purple-800">
                LENGOLF AI Lab
              </h3>
            </div>
            
            <div className="space-y-3">
              <p className="text-gray-700">Advanced technology for experienced players</p>
              
              <ul className="space-y-2">
                <li className="flex items-start">
                  <SparklesIcon className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <span>AI-powered swing analysis</span>
                </li>
                <li className="flex items-start">
                  <VideoCameraIcon className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <span>Dual-angle video replay</span>
                </li>
                <li className="flex items-start">
                  <ComputerDesktopIcon className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <span>4K course simulation</span>
                </li>
                <li className="flex items-start">
                  <UserIcon className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <span>Optimized for 1-2 experienced players</span>
                </li>
                <li className="flex items-start">
                  <HandRaisedIcon className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <span>Left-handed player friendly setup</span>
                </li>
                <li className="flex items-start">
                  <AcademicCapIcon className="h-5 w-5 text-purple-500 mr-2 mt-0.5" />
                  <span>Recommended for intermediate+ players</span>
                </li>
              </ul>
              
              {/* Placeholder for image */}
              <div className="bg-gray-200 h-48 rounded-lg flex items-center justify-center">
                <span className="text-gray-500">AI Lab Image</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Guidance Section */}
        <div className="mt-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
              <InformationCircleIcon className="h-5 w-5 mr-2" />
              Which bay is right for you?
            </h4>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-green-800 mb-1">Choose Social Bays if:</p>
                <ul className="text-gray-700 space-y-1">
                  <li>• You're new to golf</li>
                  <li>• Playing with 3+ people</li>
                  <li>• Want a casual, fun experience</li>
                  <li>• Celebrating with friends</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-purple-800 mb-1">Choose LENGOLF AI Lab if:</p>
                <ul className="text-gray-700 space-y-1">
                  <li>• You're an intermediate+ player</li>
                  <li>• Playing solo or with 1 partner</li>
                  <li>• Want to analyze your swing</li>
                  <li>• Left-handed player seeking optimal setup</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-600">
              <strong>Unlimited soft drinks</strong> included with every booking!
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
```

### Phase 4: Confirmation & Notifications

#### 4.1 Confirmation Page Updates
**File**: `app/(features)/bookings/components/booking/ConfirmationContent.tsx`

**Add Bay Type Display**:
```typescript
// Show bay type badge
{booking.bay === 'Bay 4' ? (
  <div className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-800">
    <ChipIcon className="h-4 w-4 mr-2" />
    LENGOLF AI Lab
  </div>
) : (
  <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800">
    <UsersIcon className="h-4 w-4 mr-2" />
    Social Bay
  </div>
)}
```

#### 4.2 Email Template Updates
**File**: `lib/emailService.ts`

**Enhance Email Content**:
- Add bay type section in email
- Include AI Lab features if applicable
- Add visual distinction (colors/icons in HTML email)

### Phase 5: API Updates

#### 5.1 Availability API Enhancement
**File**: `app/api/availability/route.ts`

```typescript
// Modify to return bay-specific availability
export async function POST(request: NextRequest) {
  // ... existing code ...
  
  // Add optional bayTypeFilter parameter
  const { date, currentTimeInBangkok, bayTypeFilter } = body;
  
  // Call enhanced database function
  const { data: slots } = await supabase.rpc('get_available_slots_with_bay_info', {
    p_date: date,
    p_current_time_bangkok: currentTimeInBangkok,
    p_bay_type_filter: bayTypeFilter // 'all' | 'social' | 'ai_lab'
  });
  
  return NextResponse.json({ slots });
}
```

#### 5.2 Booking Creation API
**File**: `app/api/bookings/create/route.ts`

```typescript
// Update to handle bay type preference
// Modify bay assignment logic to respect user's bay type selection
// If AI Lab is selected, only assign Bay 4
// If Social is selected, only assign Bay 1-3
```

## Visual Design Specifications

### Color Scheme
- **Social Bays**: Green theme (#10B981 primary, #D1FAE5 background)
- **AI Lab**: Purple theme (#9333EA primary, #F3E8FF background)

### Icons
- **Social Bays**: Users/Group icon
- **AI Lab**: Chip/CPU icon with tech aesthetic

### Badges & Labels
- Consistent badge styling across all touchpoints
- Clear visual hierarchy with bay type always visible

## Testing Plan

### Functional Testing
1. Filter functionality works correctly
2. Bay assignment respects filter selection
3. AI Lab warning appears for 3+ people
4. Confirmation shows correct bay type
5. Email includes bay type information

### Edge Cases
1. All social bays booked - only AI Lab available
2. AI Lab booked - only social bays available
3. Switching between filters maintains state
4. Group size changes trigger appropriate warnings

### User Flow Testing
1. Complete booking for Social Bay (3+ people)
2. Complete booking for AI Lab (1-2 people)
3. Test filter switching during selection
4. Verify all confirmation touchpoints

## Rollout Strategy

### Phase 1 - Backend (Day 1)
- Update database functions
- Deploy API changes
- Test availability logic

### Phase 2 - Frontend Core (Day 2)
- Implement filter UI
- Update time slot display
- Add bay type throughout flow

### Phase 3 - Polish (Day 3)
- Add information modal
- Enhance confirmations
- Update email templates

### Phase 4 - Testing & Launch (Day 4)
- Complete testing
- Staff training
- Go live

## Success Metrics

### Primary Metrics
- Booking completion rate maintained or improved
- Correct bay type selection (AI Lab for 1-2, Social for 3+)
- User understanding of bay differences

### Secondary Metrics
- Filter usage patterns
- Modal engagement rate
- Support ticket reduction for bay-related queries

## Future Enhancements

### Potential Phase 2 Features
1. Dynamic pricing for AI Lab
2. AI Lab exclusive packages
3. Skill level recommendations
4. Advanced booking rules for AI Lab
5. Integration with coaching system
6. Performance tracking exclusive to AI Lab

## Technical Debt & Considerations

### Current Limitations
- Database functions need refactoring for 4 bays
- Bay assignment logic is hardcoded
- No dynamic bay management system

### Recommended Improvements
1. Create flexible bay management system
2. Add bay features configuration table
3. Implement feature flags for gradual rollout
4. Add analytics tracking for bay selection

## Appendix

### Database Schema Changes
No schema changes required - Bay 4 already exists in bookings table

### API Endpoints
- `POST /api/availability` - Enhanced with bay type filtering
- `POST /api/bookings/create` - Respects bay type preference

### Component Dependencies
- TimeSlots.tsx → BayTypeFilter component
- BookingDetails.tsx → Bay type display
- ConfirmationContent.tsx → Bay type badge
- New: BayInfoModal.tsx

### Environment Variables
No new environment variables required

---

## Implementation Checklist

- [ ] Update database functions for Bay 4
- [ ] Create bay type configuration
- [ ] Implement filter UI component
- [ ] Update time slot display
- [ ] Add bay type to booking details
- [ ] Create information modal
- [ ] Update confirmation page
- [ ] Enhance email templates
- [ ] Update LINE notifications
- [ ] Complete testing
- [ ] Deploy to staging
- [ ] Staff training
- [ ] Production deployment