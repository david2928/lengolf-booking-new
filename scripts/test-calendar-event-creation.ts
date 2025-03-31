/**
 * Google Calendar Event Creation Test
 * 
 * This script tests creating an event in each of the booking calendars
 * Use: npx ts-node scripts/test-calendar-event-creation.ts
 */

import { calendar } from '../lib/googleApiConfig';
import dotenv from 'dotenv';
import { format, addHours } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Calendar IDs to test
const bookingCalendarIds = {
  'Bay 1': process.env.BOOKING_CALENDAR_BAY1_ID || '',
  'Bay 2': process.env.BOOKING_CALENDAR_BAY2_ID || '',
  'Bay 3': process.env.BOOKING_CALENDAR_BAY3_ID || '',
};

// Test function to create calendar events
async function testCalendarEventCreation() {
  console.log('=== GOOGLE CALENDAR EVENT CREATION TEST ===\n');
  
  // Generate test event dates (1 day from now)
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + 1);
  startTime.setHours(10, 0, 0, 0); // 10:00 AM tomorrow
  
  const endTime = addHours(startTime, 1); // 1 hour duration
  
  // Format for Google Calendar API
  const startDateTime = startTime.toISOString();
  const endDateTime = endTime.toISOString();
  
  console.log(`Test event time: ${format(startTime, 'yyyy-MM-dd HH:mm')} - ${format(endTime, 'HH:mm')}`);
  console.log('\n');
  
  // Create test events in each calendar
  for (const [bayName, calendarId] of Object.entries(bookingCalendarIds)) {
    if (!calendarId) {
      console.log(`❌ ${bayName}: No calendar ID found in environment variables`);
      continue;
    }
    
    // Generate a unique test event ID
    const testEventId = uuidv4().substring(0, 8);
    
    try {
      console.log(`Creating test event in ${bayName}...`);
      console.log(`Calendar ID: ${calendarId}`);
      
      // Create a test event
      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `TEST EVENT - ${testEventId} - DELETE ME`,
          description: 'This is a test event created by the debug script. It can be safely deleted.',
          start: {
            dateTime: startDateTime,
            timeZone: 'Asia/Bangkok'
          },
          end: {
            dateTime: endDateTime,
            timeZone: 'Asia/Bangkok'
          },
          colorId: '1' // Use a red color to make it obvious
        }
      });
      
      console.log(`✅ ${bayName}: Event created successfully!`);
      console.log(`   Event ID: ${response.data.id}`);
      console.log(`   Event Link: ${response.data.htmlLink}`);
      
      // Clean up by deleting the test event
      console.log(`   Cleaning up: Deleting test event...`);
      await calendar.events.delete({
        calendarId: calendarId,
        eventId: response.data.id
      });
      console.log(`   ✅ Test event deleted successfully`);
      
    } catch (error: any) {
      console.log(`❌ ${bayName}: Failed to create event`);
      console.log(`   Error: ${error.message}`);
      
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Status Text: ${error.response.statusText}`);
        console.log(`   Error Details:`, error.response.data?.error || {});
      }
    }
    console.log('\n');
  }
}

// Run the test
testCalendarEventCreation()
  .then(() => {
    console.log('Calendar event creation test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error running tests:', error);
    process.exit(1);
  }); 