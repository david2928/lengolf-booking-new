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
  /**
   * The LINE-issued ID token for the current session, or null when the channel
   * lacks the `openid` scope.
   *
   * This is the only value from the SDK that is PROOF of identity —
   * `getProfile().userId` is a plain client-side string that anything could
   * supply. Verify it server-side (`lib/auth/line-id-token.ts`) rather than
   * trusting a user id off the wire.
   *
   * Optional in this type because it is absent from older SDK builds, and the
   * rollout has to tolerate a webview that predates it.
   */
  getIDToken?: () => string | null;
  isApiAvailable: (apiName: string) => boolean;
  shareTargetPicker: (messages: unknown[]) => Promise<void>;
  closeWindow?: () => void;
  openWindow?: (config: { url: string; external: boolean }) => void;
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
