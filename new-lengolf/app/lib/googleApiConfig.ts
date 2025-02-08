import { GoogleAuth } from 'google-auth-library';

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
const googleAuth = new GoogleAuth({
  credentials: credentials,
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

export const CALENDARS = {
  'Bay 1 (Bar)':
    'a6234ae4e57933edb48a264fff4c5d3d3653f7bedce12cfd9a707c6c0ff092e4@group.calendar.google.com',
  'Bay 2':
    '3a700346dd902abd4aa448ee63e184a62f05d38bb39cb19a8fc27116c6df3233@group.calendar.google.com',
  'Bay 3 (Entrance)':
    '092757d971c313c2986b43f4c8552382a7e273b183722a44a1c4e1a396568ca3@group.calendar.google.com',
} as const;

export { googleAuth }; 