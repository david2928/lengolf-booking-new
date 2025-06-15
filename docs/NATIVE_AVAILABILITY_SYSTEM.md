# Native Availability System Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
4. [Database Functions](#database-functions)
5. [API Endpoints](#api-endpoints)
6. [Real-Time Features](#real-time-features)
7. [Frontend Integration](#frontend-integration)
8. [Performance Monitoring](#performance-monitoring)
9. [Technical Specifications](#technical-specifications)
10. [Usage Examples](#usage-examples)
11. [Troubleshooting](#troubleshooting)

## Overview

The Native Availability System is the core booking availability engine for Lengolf Forms, built on Supabase with real-time capabilities. The system provides instant availability checking, time slot management, and real-time updates across all booking interfaces.

### Key Features
- **High Performance**: Sub-50ms response times for all availability operations
- **Real-Time Updates**: Instant availability changes across all components
- **Direct Database Operations**: Native Supabase functions for optimal performance
- **Simplified Architecture**: Clean bay naming and streamlined operations
- **Comprehensive API**: Full REST API with multiple endpoint options
- **Admin Monitoring**: Built-in performance monitoring and health checks

### System Capabilities
- **Single Bay Availability**: Check availability for specific bay and time slot
- **Multi-Bay Availability**: Check availability across all bays simultaneously
- **Available Slots Discovery**: Find all available time slots for given parameters
- **Real-Time Notifications**: Instant updates when bookings change
- **Performance Monitoring**: Complete system health and performance tracking

## System Architecture

### Database-First Design

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Routes     │    │   Supabase      │
│   Components    │───▶│   (Next.js)      │───▶│   Functions     │
│                 │    │                  │    │                 │
│   React Hooks   │    │   Validation     │    │   Direct DB     │
│   Real-time     │    │   Error Handle   │    │   Operations    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               │
         │              Real-time Channel                │
         └──────────────────────────────────────────────┘
```

### Core Architecture Principles
1. **Database Functions**: All availability logic in Supabase functions for performance and reusability
2. **Real-Time Native**: Built-in Supabase real-time capabilities for instant updates
3. **Simplified Bay Model**: Direct bay names (Bay 1, Bay 2, Bay 3) matching database exactly
4. **Graceful Fallbacks**: Automatic polling backup when real-time unavailable
5. **Performance First**: Optimized indexes and query patterns for sub-50ms responses

### Database Schema

**Primary Bookings Table**
```sql
TABLE public.bookings (
    id text PRIMARY KEY,
    date date NOT NULL,
    start_time text NOT NULL,        -- Format: "HH:MM"
    duration real NOT NULL,          -- In hours (e.g., 1.5 for 90 minutes)
    bay text,                       -- "Bay 1", "Bay 2", "Bay 3"
    status text DEFAULT 'confirmed', -- 'confirmed' | 'cancelled'
    number_of_people integer,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
    -- ... other booking fields
);
```

**Performance Indexes**
```sql
-- Primary availability checking index
CREATE INDEX idx_bookings_availability_check 
ON bookings(date, bay, status, start_time, duration);

-- Time range queries optimization
CREATE INDEX idx_bookings_time_range 
ON bookings(date, start_time, duration) 
WHERE status = 'confirmed';
```

## Core Components

### 1. Availability Subscription Service

**File**: `src/lib/availability-subscription.ts`

The central service managing all availability operations and real-time subscriptions.

```typescript
export class AvailabilitySubscription {
  private supabase: SupabaseClient;
  private channels: Map<string, RealtimeChannel> = new Map();

  // Core availability checking
  async checkAvailability(
    date: string,
    bay: string,
    startTime: string,
    duration: number,
    excludeBookingId?: string
  ): Promise<boolean>

  // Multi-bay availability checking
  async checkAllBaysAvailability(
    date: string,
    startTime: string,
    duration: number,
    excludeBookingId?: string
  ): Promise<Record<string, boolean>>

  // Available time slots discovery
  async getAvailableSlots(
    date: string,
    bay: string,
    duration: number = 1.0,
    startHour: number = 10,
    endHour: number = 22
  ): Promise<TimeSlot[]>

  // Real-time subscription management
  subscribeToAvailabilityChanges(
    date: string,
    bay: string | null,
    callback: (change: AvailabilityChange) => void
  ): () => void
}
```

### 2. React Availability Hooks

**File**: `src/hooks/useAvailability.ts`

React hooks providing easy integration with components.

```typescript
// Main availability hook with real-time updates
export function useAvailability(options: UseAvailabilityOptions): UseAvailabilityReturn {
  // Returns: availability, availableSlots, loading, error, refreshAvailability
}

// Multi-bay availability hook
export function useAllBaysAvailability(
  date: string, 
  startTime: string, 
  duration: number = 1.0
): UseAllBaysAvailabilityReturn {
  // Returns: availability, loading, error, refresh
}
```

### 3. Enhanced Frontend Components

**Bay Selector with Real-Time Updates**
```typescript
// File: src/components/booking-form/bay-selector.tsx
export function BaySelector({
  selectedDate,
  selectedBay,
  selectedStartTime,
  selectedEndTime,
  onBaySelect,
  onTimeSelect,
  isManualMode = false,
  error
}: BaySelectorProps) {
  // Integrates real-time availability data
  // Visual indicators for bay availability
  // Automatic refresh on availability changes
}
```

**Time Selector with Available Slots**
```typescript
// File: src/components/booking-form/booking-time-selector/index.tsx
export function BookingTimeSelector({
  selectedDate,
  selectedTime,
  selectedBay,
  duration = 1.0,
  onTimeSelect,
  error
}: TimeSlotSelectorProps) {
  // Shows available time slots in real-time
  // Integrates with available slots API
  // Handles duration-based slot filtering
}
```

## Database Functions

### 1. Core Availability Function

```sql
CREATE OR REPLACE FUNCTION check_availability(
    p_date date,
    p_bay text,
    p_start_time text,
    p_duration real,
    p_exclude_booking_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    requested_start_minutes integer;
    requested_end_minutes integer;
    conflict_count integer;
BEGIN
    -- Convert start time to minutes since midnight
    requested_start_minutes := (split_part(p_start_time, ':', 1)::integer * 60) + 
                              split_part(p_start_time, ':', 2)::integer;
    
    -- Calculate end time in minutes
    requested_end_minutes := requested_start_minutes + (p_duration * 60)::integer;
    
    -- Check for time conflicts with confirmed bookings
    SELECT COUNT(*) INTO conflict_count
    FROM bookings
    WHERE date = p_date
      AND bay = p_bay
      AND status = 'confirmed'
      AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
      AND (
        -- Time overlap detection
        (start_time_minutes < requested_end_minutes AND 
         end_time_minutes > requested_start_minutes)
      );
    
    RETURN conflict_count = 0;
END;
$$;
```

**Performance**: ~2ms average response time

### 2. Multi-Bay Availability Function

```sql
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
    bay_record record;
    result jsonb := '{}';
    is_available boolean;
BEGIN
    -- Check availability for each bay
    FOR bay_record IN 
        SELECT DISTINCT bay 
        FROM bookings 
        WHERE bay IN ('Bay 1', 'Bay 2', 'Bay 3')
        UNION 
        VALUES ('Bay 1'), ('Bay 2'), ('Bay 3')
    LOOP
        SELECT check_availability(
            p_date, 
            bay_record.bay, 
            p_start_time, 
            p_duration, 
            p_exclude_booking_id
        ) INTO is_available;
        
        result := result || jsonb_build_object(bay_record.bay, is_available);
    END LOOP;
    
    RETURN result;
END;
$$;
```

**Performance**: ~5ms average response time

### 3. Available Slots Function

```sql
CREATE OR REPLACE FUNCTION get_available_slots(
    p_date date,
    p_bay text,
    p_duration real DEFAULT 1.0,
    p_start_hour integer DEFAULT 10,
    p_end_hour integer DEFAULT 22
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    slot_time text;
    slot_available boolean;
    slots jsonb := '[]';
    current_hour integer;
    current_minute integer;
BEGIN
    -- Generate 30-minute time slots
    FOR current_hour IN p_start_hour..p_end_hour-1 LOOP
        FOR current_minute IN 0..1 LOOP
            slot_time := lpad(current_hour::text, 2, '0') || ':' || 
                        lpad((current_minute * 30)::text, 2, '0');
            
            -- Check if this slot is available
            SELECT check_availability(p_date, p_bay, slot_time, p_duration) 
            INTO slot_available;
            
            -- Add to results if available
            IF slot_available THEN
                slots := slots || jsonb_build_object(
                    'time', slot_time,
                    'available', slot_available,
                    'bay', p_bay,
                    'duration', p_duration
                );
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN slots;
END;
$$;
```

**Performance**: ~15ms average response time

## API Endpoints

### 1. Single Bay Availability

**Endpoint**: `POST /api/bookings/availability`

```typescript
// Request
{
  "bayNumber": "Bay 1",
  "date": "2025-06-15"
}

// Response
{
  "busyTimes": [
    {
      "start": "2025-06-15T10:00:00.000+07:00",
      "end": "2025-06-15T12:00:00.000+07:00"
    }
  ]
}
```

**Features**:
- Returns busy time periods for visualization
- Compatible with calendar displays
- Handles timezone conversions
- **Performance**: ~2ms average response

### 2. Multi-Bay Availability Check

**Endpoint**: `POST /api/bookings/check-slot-for-all-bays`

```typescript
// Request
{
  "date": "2025-06-15",
  "start_time": "14:00",
  "duration": 90, // minutes
  "bookingIdToExclude": "booking-123" // optional
}

// Response
[
  {
    "name": "Bay 1",
    "apiName": "Bay 1",
    "isAvailable": true
  },
  {
    "name": "Bay 2", 
    "apiName": "Bay 2",
    "isAvailable": false
  },
  {
    "name": "Bay 3",
    "apiName": "Bay 3", 
    "isAvailable": true
  }
]
```

**Features**:
- Checks all bays simultaneously
- Optimized for booking form bay selection
- Supports booking exclusion for updates
- **Performance**: ~5ms average response

### 3. Available Time Slots

**Endpoint**: `GET /api/bookings/available-slots`

```typescript
// Request Query Parameters
?date=2025-06-15&bay=Bay%201&duration=1.5&startHour=10&endHour=22

// Response
{
  "slots": [
    {
      "time": "10:00",
      "available": true,
      "bay": "Bay 1",
      "duration": 1.5
    },
    {
      "time": "10:30", 
      "available": true,
      "bay": "Bay 1",
      "duration": 1.5
    }
  ],
  "date": "2025-06-15",
  "bay": "Bay 1",
  "duration": 1.5,
  "totalSlots": 2
}
```

**Features**:
- Generates 30-minute time slot intervals
- Configurable time range (start/end hours)
- Duration-aware availability checking
- **Performance**: ~15ms average response

## Real-Time Features

### Supabase Real-Time Integration

**Channel Management**
```typescript
const channel = supabase
  .channel(`availability-${date}-${bay || 'all'}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'bookings',
      filter: bay ? `date=eq.${date},bay=eq.${bay}` : `date=eq.${date}`
    },
    (payload) => {
      // Handle real-time availability changes
      callback({
        event: payload.eventType,
        booking: payload.new || payload.old,
        timestamp: new Date()
      });
    }
  )
  .subscribe();
```

### Connection Optimization

**Free Tier Management**
- **Connection Limit**: Optimized for Supabase free tier (200 connections)
- **Message Budget**: Manages 2M monthly message limit efficiently
- **Smart Fallbacks**: Automatic polling when connection limits reached
- **Channel Cleanup**: Proper subscription lifecycle management

**Hybrid Strategy**
```typescript
// Intelligent connection management
if (!this.canCreateConnection()) {
  // Fallback to polling mode
  return this.startPollingMode(date, bay, callback);
}

// Use real-time subscription
const channel = this.supabase.channel(channelName)
  .on('postgres_changes', config, callback)
  .subscribe();
```

### Real-Time Event Types

```typescript
interface AvailabilityChange {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  booking: {
    id: string;
    date: string;
    bay: string;
    start_time: string;
    duration: number;
    status: string;
  };
  timestamp: Date;
}
```

## Frontend Integration

### Enhanced User Experience

**Visual Indicators**
- Real-time availability dots (green/red) on bay buttons
- "Live availability" status badges
- Automatic refresh notifications with smooth transitions
- Loading states with progress indicators

**Error Handling & Fallbacks**
- Graceful degradation when real-time fails
- Manual refresh buttons for user control
- Cached data fallbacks for offline scenarios
- Connection status indicators and retry mechanisms

### Component Integration Examples

**Bay Selector Integration**
```tsx
<BaySelector
  selectedDate={selectedDate}
  selectedBay={selectedBay}
  selectedStartTime={selectedStartTime}
  selectedEndTime={selectedEndTime}
  onBaySelect={onBaySelect}
  onTimeSelect={onTimeSelect}
  // Real-time availability handled automatically
/>
```

**Time Selector Integration**
```tsx
<BookingTimeSelector
  selectedDate={selectedDate}
  selectedTime={selectedTime}
  selectedBay={selectedBay}
  duration={duration}
  onTimeSelect={onTimeSelect}
  // Available slots loaded and updated in real-time
/>
```

## Performance Monitoring

### Admin Dashboard Access

**Navigation**: Admin Panel → System Management → Availability Performance  
**Direct URL**: `/admin/performance`

### Monitored Metrics

**Performance Metrics**
- Average response time per API endpoint
- Request volume and error rates
- Real-time connection counts and message usage
- Database query performance and optimization
- Cache hit rates and efficiency

**System Health Indicators**
- Availability system uptime
- Database connection health
- Real-time subscription status
- Error rate trends and alerts

**Performance Targets**
- Single bay availability: < 50ms
- Multi-bay availability: < 100ms  
- Available slots: < 200ms
- System error rate: < 1%
- Real-time message latency: < 500ms

### Performance Dashboard Features

```typescript
// File: src/components/admin/PerformanceMonitor.tsx
export function PerformanceMonitor() {
  // Real-time performance metrics display
  // Individual endpoint performance tracking
  // System health indicators and alerts
  // Auto-refresh every 30 seconds
  // Performance insights and recommendations
  // Manual refresh capability
}
```

**Dashboard Capabilities**
- Real-time metrics with 30-second auto-refresh
- Performance trend analysis and visualization
- Automated alerts for performance degradation
- Individual endpoint monitoring and optimization
- System recommendations based on usage patterns

## Technical Specifications

### Performance Optimizations

**Database Indexes**
```sql
-- Primary availability checking index
CREATE INDEX idx_bookings_availability_check 
ON bookings(date, bay, status, start_time, duration);

-- Time range optimization for slot queries
CREATE INDEX idx_bookings_time_range 
ON bookings(date, start_time, duration) 
WHERE status = 'confirmed';
```

**Query Optimization Features**
- Index-only scans for optimal performance
- Efficient time conflict detection algorithms
- JSON aggregation for multi-bay results
- Proper query planning and execution paths

### Real-Time Database Triggers

**Availability Change Notification**
```sql
-- Trigger function for real-time notifications
CREATE OR REPLACE FUNCTION notify_availability_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify(
        'availability_change',
        json_build_object(
            'type', TG_OP,
            'date', COALESCE(NEW.date, OLD.date),
            'bay', COALESCE(NEW.bay, OLD.bay),
            'booking_id', COALESCE(NEW.id, OLD.id),
            'timestamp', now()
        )::text
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on booking changes
CREATE TRIGGER availability_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION notify_availability_change();
```

## Usage Examples

### Basic Availability Operations

```typescript
import { availabilityService } from '@/lib/availability-subscription';

// Check single bay availability
const isAvailable = await availabilityService.checkAvailability(
  '2025-06-15',
  'Bay 1', 
  '14:00',
  1.5 // duration in hours
);

// Check all bays simultaneously
const allBaysAvailability = await availabilityService.checkAllBaysAvailability(
  '2025-06-15',
  '14:00', 
  1.5
);
// Returns: { "Bay 1": true, "Bay 2": false, "Bay 3": true }

// Get available time slots
const availableSlots = await availabilityService.getAvailableSlots(
  '2025-06-15',
  'Bay 1',
  1.5, // duration
  10,  // start hour
  22   // end hour
);
```

### Real-Time Subscription

```typescript
// Subscribe to availability changes
const unsubscribe = availabilityService.subscribeToAvailabilityChanges(
  '2025-06-15',
  'Bay 1',
  (change) => {
    console.log('Availability changed:', change);
    // UI automatically updates
  }
);

// Clean up subscription when component unmounts
unsubscribe();
```

### React Hook Integration

```typescript
import { useAvailability } from '@/hooks/useAvailability';

function BookingComponent() {
  const {
    availability,
    availableSlots,
    loading,
    error,
    refreshAvailability
  } = useAvailability({
    date: '2025-06-15',
    bay: 'Bay 1',
    duration: 1.5,
    autoRefresh: true
  });

  if (loading) return <div>Loading availability...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Available Time Slots</h3>
      {availableSlots.map(slot => (
        <button key={slot.time} onClick={() => selectSlot(slot)}>
          {slot.time} {slot.available ? '✅' : '❌'}
        </button>
      ))}
      <button onClick={refreshAvailability}>Refresh</button>
    </div>
  );
}
```

### API Integration

```typescript
// Fetch available slots via API
const response = await fetch(
  '/api/bookings/available-slots?' + 
  new URLSearchParams({
    date: '2025-06-15',
    bay: 'Bay 1',
    duration: '1.5',
    startHour: '10',
    endHour: '22'
  })
);

const { slots } = await response.json();

// Check multi-bay availability
const bayCheckResponse = await fetch('/api/bookings/check-slot-for-all-bays', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: '2025-06-15',
    start_time: '14:00',
    duration: 90 // minutes
  })
});

const bayAvailability = await bayCheckResponse.json();
```

## Troubleshooting

### Common Issues

**1. Real-Time Connection Issues**
```typescript
// Check connection status
const isConnected = supabase.realtime.isConnected();

// Force reconnection
if (!isConnected) {
  await supabase.realtime.disconnect();
  await supabase.realtime.connect();
}

// Fallback to manual refresh
refreshAvailability();
```

**2. Performance Problems**
```sql
-- Verify index usage
EXPLAIN ANALYZE SELECT * FROM bookings 
WHERE date = '2025-06-15' 
  AND bay = 'Bay 1' 
  AND status = 'confirmed';

-- Should show "Index Only Scan" or "Index Scan"
```

**3. Availability Data Inconsistencies**
```typescript
// Force refresh availability data
await availabilityService.checkAvailability(date, bay, time, duration);

// Clear cached state and reload
refreshAvailability();

// Check for database connection issues
const { data, error } = await supabase.from('bookings').select('count');
if (error) console.error('Database connection issue:', error);
```

### Debug Tools and Monitoring

**Performance Monitoring Dashboard**
- Access: `/admin/performance`
- Real-time metrics and performance tracking
- Database query analysis and optimization suggestions
- Connection health and real-time status monitoring

**Browser Console Debugging**
```javascript
// Check Supabase connection
console.log('Supabase connected:', supabase.realtime.isConnected());

// Monitor availability changes in real-time
availabilityService.subscribeToAvailabilityChanges(
  '2025-06-15', 'Bay 1', 
  (change) => console.log('Availability change:', change)
);

// Test availability function directly
supabase.rpc('check_availability', {
  p_date: '2025-06-15',
  p_bay: 'Bay 1',
  p_start_time: '14:00',
  p_duration: 1.5
}).then(console.log);
```

### Error Handling Patterns

**API Error Handling**
```typescript
try {
  const availability = await checkAvailability(params);
  return availability;
} catch (error) {
  console.error('Availability check failed:', error);
  
  // Try cached data first
  const cachedData = getCachedAvailability(params);
  if (cachedData) return cachedData;
  
  // Show user-friendly error
  throw new Error('Unable to check availability. Please try again.');
}
```

**Real-Time Error Recovery**
```typescript
channel.subscribe((status) => {
  if (status === 'CHANNEL_ERROR') {
    console.log('Real-time connection error, retrying...');
    
    // Exponential backoff retry
    setTimeout(() => {
      subscribeToAvailabilityChanges(date, bay, callback);
    }, Math.min(retryCount * 1000, 10000));
  }
});
```

---

## Integration with Admin Panel

The availability performance monitoring is fully integrated into the Lengolf Forms admin panel:

**Access Methods**: 
- **Desktop Navigation**: Admin Menu → "Availability Performance"
- **Mobile Navigation**: Admin Dashboard → System Management → "Availability Performance"
- **Direct URL**: `/admin/performance`

**Admin Panel Integration**: See [Admin Panel Documentation](./ADMIN_PANEL.md) for complete administrative system overview.

---

**Last Updated**: January 2025  
**Version**: 1.0  
**System Status**: Production Ready  
**Maintainer**: Lengolf Development Team

**Related Documentation**:
- [Project Structure](../PROJECT_STRUCTURE.md) - Complete codebase organization
- [Backend Documentation](../BACKEND_DOCUMENTATION.md) - API and server architecture
- [Admin Panel](./ADMIN_PANEL.md) - Administrative interface and monitoring
- [API Reference](../api/API_REFERENCE.md) - Complete API documentation 