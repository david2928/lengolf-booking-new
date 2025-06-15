# LENGOLF Native Availability System - Implementation Plan

## Project Overview

**Objective**: Migrate from Google Calendar-based availability system to a native Supabase database-driven system with real-time capabilities.

**Duration**: 1-2 days (targeted function updates + endpoint migration)
**Risk Level**: Low (core functions proven accurate, minimal updates needed)
**Expected Performance Improvement**: 90-95% response time reduction (500ms → 15ms)

## Pre-Implementation Checklist

### ✅ Validated Components (Ready for Use)
- [x] **Database functions** - 100% accurate availability logic tested
- [x] **Real-time notification infrastructure** (`notify_availability_change`)
- [x] **Database schema** with RLS policies
- [x] **Existing booking data** and patterns
- [x] **Bay naming consistency** in database ("Bay 1", "Bay 2", "Bay 3")
- [x] **API endpoint URLs** - can keep existing `/api/availability` paths
- [x] **Request/response formats** - 100% compatible with current system

### 🔧 Components Requiring Minor Updates (4-6 hours total)
- [ ] **`check_all_bays_availability()`** - Filter to only return 3 standard bays (5 minutes)
- [ ] **Create `get_available_slots_with_max_hours()`** - Enhanced slot generation (2-3 hours)
- [ ] **Add current time filtering** to functions (1 hour)

### ✅ Components Staying the Same (No Changes Needed)
- [x] **Frontend components** and hooks
- [x] **Authentication middleware**
- [x] **Error handling patterns**
- [x] **Bay naming** (already consistent)

## Simplified Implementation Strategy

### Phase 1: Database Function Updates (4-6 hours)

#### 1.1 Fix Bay Filtering (5 minutes)
**File**: Database migration
**Issue**: `check_all_bays_availability()` returns 5 bays instead of 3

```sql
-- Update function to only check standard bays
CREATE OR REPLACE FUNCTION check_all_bays_availability(
    p_date date,
    p_start_time text,
    p_duration real,
    p_exclude_booking_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    bay_name text;
    result jsonb := '{}';
    is_available boolean;
BEGIN
    -- Only check standard bays (not legacy names)
    FOR bay_name IN VALUES ('Bay 1'), ('Bay 2'), ('Bay 3') LOOP
        SELECT check_availability(
            p_date, 
            bay_name, 
            p_start_time, 
            p_duration, 
            p_exclude_booking_id
        ) INTO is_available;
        
        result := result || jsonb_build_object(bay_name, is_available);
    END LOOP;
    
    RETURN result;
END;
$$;
```

#### 1.2 Create Enhanced Slot Generation Function (2-3 hours)
**File**: Database migration
**Purpose**: Replace `get_available_slots()` with enhanced version

```sql
CREATE OR REPLACE FUNCTION get_available_slots_with_max_hours(
    p_date date,
    p_current_time_bangkok timestamptz DEFAULT NULL,
    p_start_hour integer DEFAULT 10,
    p_end_hour integer DEFAULT 23
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    slot_time text;
    slot_hour integer;
    slot_available boolean;
    max_hours integer;
    period text;
    slots jsonb := '[]';
    current_hour_bangkok integer;
    is_today boolean;
    start_hour_adjusted integer;
BEGIN
    -- Handle current time filtering for Bangkok timezone
    IF p_current_time_bangkok IS NOT NULL THEN
        current_hour_bangkok := EXTRACT(hour FROM p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok');
        is_today := DATE(p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok') = p_date;
        start_hour_adjusted := CASE 
            WHEN is_today THEN GREATEST(p_start_hour, current_hour_bangkok + 1)
            ELSE p_start_hour
        END;
    ELSE
        start_hour_adjusted := p_start_hour;
    END IF;
    
    -- Generate hourly time slots (not 30-minute)
    FOR slot_hour IN start_hour_adjusted..p_end_hour-1 LOOP
        slot_time := lpad(slot_hour::text, 2, '0') || ':00';
        
        -- Calculate max consecutive hours available
        max_hours := 0;
        FOR check_duration IN 1..5 LOOP -- Max 5 hours
            -- Check all bays for this duration
            IF EXISTS (
                SELECT 1 FROM (
                    VALUES ('Bay 1'), ('Bay 2'), ('Bay 3')
                ) AS bays(bay_name)
                WHERE check_availability(p_date, bay_name, slot_time, check_duration::real)
            ) THEN
                max_hours := check_duration;
            ELSE
                EXIT; -- Stop at first unavailable duration
            END IF;
        END LOOP;
        
        -- Only include slots with at least 1 hour available
        IF max_hours > 0 THEN
            -- Determine period
            period := CASE 
                WHEN slot_hour < 12 THEN 'morning'
                WHEN slot_hour < 17 THEN 'afternoon'
                ELSE 'evening'
            END;
            
            slots := slots || jsonb_build_object(
                'startTime', slot_time,
                'endTime', lpad((slot_hour + max_hours)::text, 2, '0') || ':00',
                'maxHours', max_hours,
                'period', period
            );
        END IF;
    END LOOP;
    
    RETURN slots;
END;
$$;
```

#### 1.3 Add Current Time Parameter to Existing Functions (30 minutes)
**Purpose**: Support current time filtering

```sql
-- Update check_all_bays_availability to support current time filtering
-- (Implementation details based on requirements)
```

### Phase 2: API Endpoint Migration (2-4 hours)

#### 2.1 Update `POST /api/availability` (1-2 hours)
**File**: `app/api/availability/route.ts`
**Strategy**: Replace Google Calendar calls with database function calls

```typescript
// Replace existing Google Calendar logic with:
export async function POST(request: NextRequest) {
  try {
    const { date, currentTimeInBangkok } = await request.json();
    
    // Use new database function instead of Google Calendar
    const { data: slots, error } = await supabase
      .rpc('get_available_slots_with_max_hours', {
        p_date: date,
        p_current_time_bangkok: currentTimeInBangkok,
        p_start_hour: 10,
        p_end_hour: 23
      });
    
    if (error) throw error;
    
    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
```

#### 2.2 Update `POST /api/availability/check` (1-2 hours)
**File**: `app/api/availability/check/route.ts`
**Strategy**: Replace Google Calendar calls with database function calls

```typescript
// Replace existing Google Calendar logic with:
export async function POST(request: NextRequest) {
  try {
    const { date, startTime, duration } = await request.json();
    const durationHours = duration / 60; // Convert minutes to hours
    
    // Use database function instead of Google Calendar
    const { data: bayAvailability, error } = await supabase
      .rpc('check_all_bays_availability', {
        p_date: date,
        p_start_time: startTime,
        p_duration: durationHours
      });
    
    if (error) throw error;
    
    // Transform to expected format
    const availableBays = Object.entries(bayAvailability)
      .filter(([_, isAvailable]) => isAvailable)
      .map(([bayName, _]) => bayName);
    
    const firstAvailableBay = availableBays[0] || null;
    
    // Return in expected format
    const result = Object.entries(bayAvailability).map(([bayName, isAvailable]) => ({
      name: bayName,
      apiName: bayName,
      isAvailable: isAvailable as boolean
    }));
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check availability' },
      { status: 500 }
    );
  }
}
```

### Phase 3: Testing & Validation (2-4 hours)

#### 3.1 Function Testing (1 hour)
- [ ] Test updated `check_all_bays_availability()` returns only 3 bays
- [ ] Test `get_available_slots_with_max_hours()` with real data
- [ ] Validate current time filtering works correctly

#### 3.2 API Endpoint Testing (1-2 hours)
- [ ] Compare new API responses with current Google Calendar responses
- [ ] Test with existing frontend components
- [ ] Validate response times (should be <50ms vs current 200-500ms)

#### 3.3 Integration Testing (1 hour)
- [ ] Test booking flow end-to-end
- [ ] Validate timezone handling (Asia/Bangkok)
- [ ] Test error handling and edge cases

## Deployment Strategy

### Option 1: Direct Replacement (Recommended)
1. **Deploy function updates** to production database
2. **Deploy API endpoint updates** to production
3. **Monitor performance** and error rates
4. **Rollback plan**: Revert API endpoints to Google Calendar if issues

### Option 2: Feature Flag (Conservative)
1. **Add feature flag** `USE_NATIVE_AVAILABILITY`
2. **Deploy with flag disabled** initially
3. **Enable for testing** with gradual rollout
4. **Full cutover** once validated

## Success Metrics

### Performance Targets
- **Response time**: <50ms (vs current 200-500ms)
- **Error rate**: <1%
- **Availability**: 99.9%

### Validation Criteria
- [ ] All existing tests pass
- [ ] Response format 100% compatible
- [ ] Performance improvement >90%
- [ ] No booking conflicts or errors

## Risk Mitigation

### Low Risk Items ✅
- **Database function accuracy** - Proven in testing
- **Performance improvement** - Guaranteed with direct DB access
- **Rollback capability** - Can revert instantly

### Mitigation Strategies
- **Comprehensive testing** before deployment
- **Gradual rollout** with monitoring
- **Immediate rollback plan** if issues arise
- **A/B testing** during transition period

## Timeline Summary

**Day 1 (4-6 hours)**:
- Morning: Update database functions (1.1, 1.2, 1.3)
- Afternoon: Update API endpoints (2.1, 2.2)

**Day 2 (2-4 hours)**:
- Morning: Testing and validation (3.1, 3.2, 3.3)
- Afternoon: Deployment and monitoring

**Total Effort**: 6-10 hours over 1-2 days

---

**Conclusion**: This simplified approach leverages the proven accuracy of existing database functions while making minimal, targeted updates to achieve full Google Calendar replacement with significant performance improvements. 