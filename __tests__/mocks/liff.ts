import type { LiffMethods } from '@/types/liff';

// Mock LIFF SDK for testing
export const mockLiff: LiffMethods = {
  init: jest.fn().mockResolvedValue(undefined),
  isLoggedIn: jest.fn().mockReturnValue(true),
  login: jest.fn(),
  getProfile: jest.fn().mockResolvedValue({
    userId: 'U1234567890abcdef',
    displayName: 'Test User',
    pictureUrl: 'https://example.com/avatar.jpg',
    statusMessage: 'Testing'
  }),
  isApiAvailable: jest.fn().mockReturnValue(true),
  shareTargetPicker: jest.fn().mockResolvedValue(undefined),
  closeWindow: jest.fn(),
  getOS: jest.fn().mockReturnValue('web'),
  getLanguage: jest.fn().mockReturnValue('en'),
  getVersion: jest.fn().mockReturnValue('2.22.0'),
  isInClient: jest.fn().mockReturnValue(true)
};

// Setup function for tests
export function setupLiffMock() {
  global.window = global.window || {};
  (global.window as any).liff = mockLiff;
}

// Reset function for cleanup
export function resetLiffMock() {
  jest.clearAllMocks();
}
