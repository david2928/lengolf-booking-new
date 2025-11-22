// LIFF SDK Type Definitions

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export interface Prize {
  id: string;
  prize_name: string;
  prize_description: string;
  redemption_code: string;
  spin_timestamp: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  redeemed_by_staff_name: string | null;
  draw_sequence: number;
  image_url?: string;
}

export interface LiffMethods {
  init: (config: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (config?: { redirectUri?: string }) => void;
  getProfile: () => Promise<LiffProfile>;
  isApiAvailable: (apiName: string) => boolean;
  shareTargetPicker: (messages: unknown[]) => Promise<void>;
  closeWindow?: () => void;
  getOS?: () => string;
  getLanguage?: () => string;
  getVersion?: () => string;
  isInClient?: () => boolean;
}

declare global {
  interface Window {
    liff: LiffMethods;
  }
}
