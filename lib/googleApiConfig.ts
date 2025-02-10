import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

if (!process.env.SERVICE_ACCOUNT_KEY_BASE64) {
  throw new Error('Missing SERVICE_ACCOUNT_KEY_BASE64 environment variable');
}

// Parse the base64-encoded service account key
let credentials;
try {
  credentials = JSON.parse(
    Buffer.from(process.env.SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8')
  );
} catch (error) {
  console.error('Failed to parse SERVICE_ACCOUNT_KEY_BASE64:', error);
  throw error;
}

// Instantiate GoogleAuth with the parsed credentials and required scopes
const auth = new GoogleAuth({
  credentials: credentials,
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
});

export const AVAILABILITY_CALENDARS = {
  'Bay 1 (Bar)': process.env.AVAILABILITY_CALENDAR_BAY1_ID!,
  'Bay 2': process.env.AVAILABILITY_CALENDAR_BAY2_ID!,
  'Bay 3 (Entrance)': process.env.AVAILABILITY_CALENDAR_BAY3_ID!,
} as const;

// Validate required environment variables
const missingVars = Object.entries(AVAILABILITY_CALENDARS).filter(([_, value]) => !value);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables for availability calendars: ${missingVars
      .map(([key]) => `AVAILABILITY_CALENDAR_${key.replace(/[ ()]/g, '')}_ID`)
      .join(', ')}`
  );
}

const calendar = google.calendar({ version: 'v3', auth });

export { calendar, auth };

export type AvailabilityBay = keyof typeof AVAILABILITY_CALENDARS; 