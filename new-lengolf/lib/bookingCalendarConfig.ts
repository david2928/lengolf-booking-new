export const BOOKING_CALENDARS = {
  'Bay 1': process.env.BOOKING_CALENDAR_BAY1_ID!,
  'Bay 2': process.env.BOOKING_CALENDAR_BAY2_ID!,
  'Bay 3': process.env.BOOKING_CALENDAR_BAY3_ID!,
} as const;

// Validate required environment variables
const missingVars = Object.entries(BOOKING_CALENDARS).filter(([_, value]) => !value);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables for booking calendars: ${missingVars
      .map(([key]) => `BOOKING_CALENDAR_${key.replace(' ', '')}_ID`)
      .join(', ')}`
  );
}

export type BookingBay = keyof typeof BOOKING_CALENDARS; 