/**
 * In-app (embedded WebView) browser detection.
 *
 * WHY THIS EXISTS: Google refuses OAuth inside embedded WebViews and answers
 * with `disallowed_useragent` ("This browser or app may not be secure"). The
 * user never returns to our callback, so the failure is invisible server-side —
 * we see `POST /api/auth/signin/google` with no matching
 * `GET /api/auth/callback/google` and nothing else. A customer in that state
 * just sees a dead end and gives up (or opens the chat widget to tell us the
 * site is "giving errors").
 *
 * The detector therefore has to be generous: anything we fail to classify gets
 * offered a Google button that cannot work. Being wrong in the other direction
 * is cheap — we merely hide one of three providers and still offer LINE,
 * Facebook and guest.
 *
 * Note that iOS in-app WebViews (SFSafariViewController and friends) largely
 * mimic mobile Safari and expose no reliable token, so UA sniffing cannot be
 * exhaustive. The guest flow is the real safety net; see the login page, which
 * promotes it whenever a sign-in has already failed.
 */

/**
 * Which embedded browser the user agent looks like, or `null` for what appears
 * to be a normal standalone browser.
 *
 * - `line`      — the LINE app's WebView (also drives the LIFF redirect in middleware)
 * - `facebook`  — Facebook app / Messenger WebView
 * - `instagram` — Instagram app WebView
 * - `other`     — some other embedded WebView we recognise but don't special-case
 */
export type InAppBrowser = 'line' | 'facebook' | 'instagram' | 'other' | null;

/**
 * Kept as a named export because `middleware.ts` needs exactly this check (and
 * used to carry its own copy of it — the two drifting apart is precisely the
 * bug class this module exists to prevent).
 */
export function isLineBrowser(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').toLowerCase();
  return ua.includes('line/') || ua.includes('line ');
}

/**
 * Facebook app, Messenger, and the shared Meta in-app browser tokens.
 *
 * Deliberately NOT matching a bare `messenger`: WeChat's user agent contains
 * `MicroMessenger`, so that substring would misclassify every WeChat user as
 * Facebook and hide the LINE button from them. iOS Messenger already carries
 * `FBAN/MessengerForiOS`, and Android Messenger identifies as `Orca-Android`.
 */
function isFacebookBrowser(ua: string): boolean {
  return (
    ua.includes('fban/') ||
    ua.includes('fbav/') ||
    ua.includes('fbios/') ||
    ua.includes('fbsv/') ||
    ua.includes('fb_iab') ||
    ua.includes('fbdv/') ||
    ua.includes('orca-android')
  );
}

/**
 * Embedded WebViews that aren't LINE/Facebook/Instagram but still break Google
 * OAuth. `; wv` is the generic Android WebView marker — it covers every Android
 * app that embeds a browser without declaring itself, which is the long tail
 * that a hand-written vendor list always misses.
 */
const OTHER_WEBVIEW_TOKENS = [
  '; wv',           // generic Android WebView
  'micromessenger', // WeChat
  'kakaotalk',      // KakaoTalk
  'naver',          // Naver / LINE-adjacent Korean apps
  'whatsapp',
  'snapchat',
  'twitter',
  'tiktok',
  'musical_ly',     // older TikTok builds
  'bytedance',
  'okhttp',         // apps proxying through OkHttp's UA
];

/**
 * Classify a user agent. Pass `navigator.userAgent` on the client, or the
 * `user-agent` request header on the server.
 */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return null;

  // LINE first: the LINE WebView also carries tokens that look Android-generic,
  // and LINE has dedicated LIFF handling that must win.
  if (isLineBrowser(ua)) return 'line';
  if (ua.includes('instagram')) return 'instagram';
  if (isFacebookBrowser(ua)) return 'facebook';
  if (OTHER_WEBVIEW_TOKENS.some((token) => ua.includes(token))) return 'other';

  return null;
}

/**
 * Google blocks OAuth in every embedded WebView, so the Google button is
 * useless (worse than useless — it's a dead end) whenever we detect one.
 */
export function blocksGoogleOAuth(kind: InAppBrowser): boolean {
  return kind !== null;
}
