import { detectInAppBrowser, isLineBrowser, blocksGoogleOAuth } from '@/lib/in-app-browser';

// Real user agents. The embedded ones are the cases that matter: Google refuses
// OAuth inside a WebView (`disallowed_useragent`), the customer never returns to
// our callback, and nothing is logged server-side — so a misclassification here
// surfaces only as a customer telling us the site "keeps giving errors".
const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  safariIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  lineIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Line/14.1.0',
  lineAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Line/14.1.0',

  facebookIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.2]',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/448.0.0.35.114;]',
  messenger:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/435.0.0.29.109;]',

  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 316.0.0.28.109',

  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  wechat:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.42',
};

describe('detectInAppBrowser', () => {
  it('treats ordinary standalone browsers as not-embedded', () => {
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.safariIOS)).toBeNull();
    expect(detectInAppBrowser(UA.desktopChrome)).toBeNull();
  });

  it('handles missing user agents without throwing', () => {
    expect(detectInAppBrowser(undefined)).toBeNull();
    expect(detectInAppBrowser(null)).toBeNull();
    expect(detectInAppBrowser('')).toBeNull();
  });

  it('detects the LINE app on both platforms', () => {
    expect(detectInAppBrowser(UA.lineIOS)).toBe('line');
    expect(detectInAppBrowser(UA.lineAndroid)).toBe('line');
  });

  it('prefers LINE over the generic Android WebView marker', () => {
    // The Android LINE UA carries "; wv" too. LINE must win, because LINE users
    // are redirected into the LIFF flow rather than the web login.
    expect(UA.lineAndroid).toContain('; wv');
    expect(detectInAppBrowser(UA.lineAndroid)).toBe('line');
  });

  it('detects Facebook and Messenger', () => {
    expect(detectInAppBrowser(UA.facebookIOS)).toBe('facebook');
    expect(detectInAppBrowser(UA.facebookAndroid)).toBe('facebook');
    expect(detectInAppBrowser(UA.messenger)).toBe('facebook');
  });

  it('detects Instagram separately from Facebook', () => {
    // Instagram is Meta, but its WebView is not the Facebook app: Facebook
    // Login still works there, so it must not be collapsed into 'facebook'
    // (which would hide the LINE button).
    expect(detectInAppBrowser(UA.instagram)).toBe('instagram');
  });

  it('catches the long tail of embedded WebViews', () => {
    expect(detectInAppBrowser(UA.androidWebView)).toBe('other');
    expect(detectInAppBrowser(UA.wechat)).toBe('other');
  });

  it('does not mistake WeChat for Facebook', () => {
    // Regression: "MicroMessenger" contains "messenger", so matching that bare
    // substring classified every WeChat user as Facebook — which hides the LINE
    // button from them, in a market where LINE is the dominant login.
    expect(UA.wechat.toLowerCase()).toContain('messenger');
    expect(detectInAppBrowser(UA.wechat)).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(detectInAppBrowser(UA.instagram.toUpperCase())).toBe('instagram');
    expect(detectInAppBrowser(UA.lineIOS.toUpperCase())).toBe('line');
  });
});

describe('isLineBrowser', () => {
  it('matches what detectInAppBrowser classifies as LINE', () => {
    // middleware.ts routes LINE users to LIFF using this helper while the login
    // page gates providers using detectInAppBrowser. They must never disagree.
    for (const ua of [UA.lineIOS, UA.lineAndroid]) {
      expect(isLineBrowser(ua)).toBe(true);
      expect(detectInAppBrowser(ua)).toBe('line');
    }
    for (const ua of [UA.chromeAndroid, UA.safariIOS, UA.instagram, UA.facebookIOS]) {
      expect(isLineBrowser(ua)).toBe(false);
      expect(detectInAppBrowser(ua)).not.toBe('line');
    }
  });
});

describe('blocksGoogleOAuth', () => {
  it('blocks Google in every embedded browser and allows it elsewhere', () => {
    expect(blocksGoogleOAuth(null)).toBe(false);
    for (const kind of ['line', 'facebook', 'instagram', 'other'] as const) {
      expect(blocksGoogleOAuth(kind)).toBe(true);
    }
  });
});
