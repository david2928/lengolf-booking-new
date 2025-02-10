import { POST } from '@/app/api/availability/route';
import { calendar } from '@/lib/googleApiConfig';
import { createClient } from '@/utils/supabase/server';
import { updateCalendarCache } from '@/lib/cache';

// Mock the dependencies
jest.mock('@/lib/googleApiConfig', () => ({
  calendar: {
    events: {
      list: jest.fn()
    }
  },
  AVAILABILITY_CALENDARS: {
    'Bay 1 (Bar)': 'bay1@calendar.com',
    'Bay 2': 'bay2@calendar.com',
    'Bay 3 (Entrance)': 'bay3@calendar.com'
  }
}));

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn()
}));

jest.mock('@/lib/cache', () => ({
  calendarCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  authCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  getCacheKey: {
    auth: jest.fn(),
    calendar: jest.fn(),
  },
  updateCalendarCache: jest.fn(),
}));

// Mock Request/Response
global.Request = class MockRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);
  }
};

describe('Availability API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase authentication
    (createClient as jest.Mock).mockImplementation(() => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null })
      }
    }));

    // Mock updateCalendarCache to resolve immediately
    (updateCalendarCache as jest.Mock).mockResolvedValue(undefined);
  });

  it('should correctly calculate available slots with real booking data', async () => {
    // Mock the calendar events for a full day
    const mockEvents = [
      // Bay 1 events
      {
        data: {
          items: [
            {
              summary: 'Tomer Liran - Bay 1',
              start: { dateTime: '2025-02-11T12:00:00+07:00' },
              end: { dateTime: '2025-02-11T13:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Benz - Bay 1',
              start: { dateTime: '2025-02-11T13:00:00+07:00' },
              end: { dateTime: '2025-02-11T14:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Shooting Pro Ratchavin - Bay 1',
              start: { dateTime: '2025-02-11T14:00:00+07:00' },
              end: { dateTime: '2025-02-11T14:45:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Peach C. - Bay 1',
              start: { dateTime: '2025-02-11T15:00:00+07:00' },
              end: { dateTime: '2025-02-11T17:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Chen Nan (Ian) - Bay 1',
              start: { dateTime: '2025-02-11T17:00:00+07:00' },
              end: { dateTime: '2025-02-11T18:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Poppee - Bay 1',
              start: { dateTime: '2025-02-11T18:00:00+07:00' },
              end: { dateTime: '2025-02-11T19:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Chris Lee - Bay 1',
              start: { dateTime: '2025-02-11T19:00:00+07:00' },
              end: { dateTime: '2025-02-11T20:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Y.Nakano - Bay 1',
              start: { dateTime: '2025-02-11T20:00:00+07:00' },
              end: { dateTime: '2025-02-11T21:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            },
            {
              summary: 'Bond - Bay 1',
              start: { dateTime: '2025-02-11T21:00:00+07:00' },
              end: { dateTime: '2025-02-11T22:00:00+07:00' },
              organizer: { email: 'bay1@calendar.com' }
            }
          ]
        }
      },
      // Bay 2 events
      {
        data: {
          items: [
            {
              summary: 'Paul Watts - Bay 2',
              start: { dateTime: '2025-02-11T10:00:00+07:00' },
              end: { dateTime: '2025-02-11T11:00:00+07:00' },
              organizer: { email: 'bay2@calendar.com' }
            },
            {
              summary: 'Benz Narongkorn - Bay 2',
              start: { dateTime: '2025-02-11T11:00:00+07:00' },
              end: { dateTime: '2025-02-11T13:00:00+07:00' },
              organizer: { email: 'bay2@calendar.com' }
            },
            {
              summary: 'Lakshay(lucky) - Bay 2',
              start: { dateTime: '2025-02-11T15:00:00+07:00' },
              end: { dateTime: '2025-02-11T16:00:00+07:00' },
              organizer: { email: 'bay2@calendar.com' }
            },
            {
              summary: 'Lakshay(lucky) - Bay 2',
              start: { dateTime: '2025-02-11T16:00:00+07:00' },
              end: { dateTime: '2025-02-11T18:00:00+07:00' },
              organizer: { email: 'bay2@calendar.com' }
            },
            {
              summary: 'An - Bay 2',
              start: { dateTime: '2025-02-11T18:00:00+07:00' },
              end: { dateTime: '2025-02-11T20:00:00+07:00' },
              organizer: { email: 'bay2@calendar.com' }
            },
            {
              summary: 'Jump Boontaveeklt - Bay 2',
              start: { dateTime: '2025-02-11T20:00:00+07:00' },
              end: { dateTime: '2025-02-11T21:00:00+07:00' },
              organizer: { email: 'bay2@calendar.com' }
            }
          ]
        }
      },
      // Bay 3 events
      {
        data: {
          items: [
            {
              summary: 'Fred - Bay 3',
              start: { dateTime: '2025-02-11T10:00:00+07:00' },
              end: { dateTime: '2025-02-11T12:00:00+07:00' },
              organizer: { email: 'bay3@calendar.com' }
            },
            {
              summary: 'Peach C. - Bay 3',
              start: { dateTime: '2025-02-11T18:00:00+07:00' },
              end: { dateTime: '2025-02-11T20:00:00+07:00' },
              organizer: { email: 'bay3@calendar.com' }
            },
            {
              summary: 'KORN J - Bay 3',
              start: { dateTime: '2025-02-11T20:00:00+07:00' },
              end: { dateTime: '2025-02-11T23:00:00+07:00' },
              organizer: { email: 'bay3@calendar.com' }
            }
          ]
        }
      }
    ];

    // Create a copy of mockEvents for each calendar.events.list call
    const mockEventsCopy = [...mockEvents];
    (calendar.events.list as jest.Mock).mockImplementation(() => 
      Promise.resolve(mockEventsCopy.shift())
    );

    const request = new Request('http://localhost/api/availability', {
      method: 'POST',
      body: JSON.stringify({
        date: '2025-02-11',
        currentTimeInBangkok: new Date('2025-02-10T20:47:21+07:00').toISOString()
      })
    });

    const response = await POST(request);
    const data = await response.json();

    // Verify the slots
    expect(data.slots).toBeDefined();
    
    // Helper function to find a slot by start time
    const findSlot = (startTime: string) => 
      data.slots.find((slot: any) => slot.startTime === startTime);

    // Test morning slots (10:00-12:00)
    const slot10 = findSlot('10:00');
    expect(slot10).toBeDefined();
    expect(slot10.maxHours).toBe(2); // Bay 1 is available for 2 hours until 12:00

    // Test early afternoon slots (12:00-15:00)
    const slot13 = findSlot('13:00');
    expect(slot13).toBeDefined(); // Bay 3 should be available
    expect(slot13.maxHours).toBe(5); // Available until 18:00 when Peach C. starts in Bay 3

    // Test mid-afternoon slots (15:00-18:00)
    const slot14 = findSlot('14:00');
    expect(slot14).toBeDefined(); // Bay 3 still available
    expect(slot14.maxHours).toBe(4); // Available until 18:00 when all bays are booked
    
    // Test evening slots (18:00-21:00)
    const slot18 = findSlot('18:00');
    expect(slot18).toBeUndefined(); // All bays are booked

    // Test late evening slots (21:00-23:00)
    const slot22 = findSlot('22:00');
    expect(slot22).toBeDefined(); // Bay 1 and Bay 2 are available
    expect(slot22.maxHours).toBe(1); // Only 1 hour until closing

    // Test edge cases
    const slot15 = findSlot('15:00');
    expect(slot15).toBeDefined(); // Bay 3 still available
    expect(slot15.maxHours).toBe(3); // Available until 18:00
    
    const slot2045 = findSlot('20:45');
    expect(slot2045).toBeUndefined(); // Should not create slots with less than 15 min until next booking

    // Log all slots for debugging
    console.log('Available slots:', JSON.stringify(data.slots, null, 2));
  });
}); 