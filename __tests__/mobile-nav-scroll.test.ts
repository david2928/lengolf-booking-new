/**
 * Guards the mobile navigation menu against becoming unreachable.
 *
 * The bug (reproduced 2026-08-03 in a real browser at 812x375, i.e. a phone in
 * landscape): opening the hamburger set `document.body.style.overflow =
 * 'hidden'`, while the menu itself rendered as a plain in-flow child of a
 * `sticky top-0` header with no height cap and no scroller of its own. Anything
 * past the fold was therefore unreachable by any gesture — the page could not
 * scroll because it was locked, and the menu could not scroll because it was
 * `overflow: visible`. Measured: 165px below the fold with "Golf Lessons",
 * "Main Site" and "Sign In" fully off-screen. A signed-in VIP gets ~290px more
 * menu again, which overflows even an 812px-tall phone held in portrait.
 *
 * A `sticky` element cannot be scrolled to: pinned at `top: 0`, its overflow
 * below the fold is unreachable even with the page unlocked. So the fix is not
 * to drop the scroll lock — it is to cap the header at the dynamic viewport
 * height and let the menu be the flex child that absorbs the shortfall and
 * scrolls itself.
 *
 * These are source-level assertions by necessity: jsdom performs no layout, so
 * every element reports zero height and a render test passes against the broken
 * markup exactly as happily as against the fixed one. They therefore cannot
 * prove the menu scrolls — only that the ingredients are all still present. The
 * real proof is a browser at a small viewport: `nav.scrollHeight >
 * nav.clientHeight`, then scroll to the end and assert the last row's
 * `getBoundingClientRect().bottom <= innerHeight`.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { act, renderHook } from '@testing-library/react';
import {
  HEADER_DESKTOP_QUERY,
  useCloseMobileMenuOnDesktop,
} from '@/hooks/useCloseMobileMenuOnDesktop';

const REPO_ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const HEADER = 'components/shared/Header.tsx';

/**
 * Read out of the config rather than scraped out of its source: `npm run format`
 * runs Prettier with no config file, so its default `singleQuote: false` would
 * rewrite `'header-desktop'` to `"header-desktop"` and defeat a regex.
 */
const HEADER_DESKTOP_SCREEN = 'header-desktop';
const headerDesktopWidth: string =
  require('../tailwind.config').default.theme.extend.screens[
    HEADER_DESKTOP_SCREEN
  ];

/**
 * Every `className` in a file, whether written as a plain string or as a
 * template literal. Selecting these by content rather than by position keeps
 * the assertions indifferent to class ORDER — otherwise a Tailwind
 * class-sorting formatter would redden the suite while changing nothing.
 */
const classLists = (source: string): string[] =>
  [...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => m[1] ?? m[2],
  );

/** The one class list containing every token in `needles`. */
const listWith = (source: string, ...needles: string[]): string => {
  const hits = classLists(source).filter((list) =>
    needles.every((n) => list.includes(n)),
  );
  expect(hits).toHaveLength(1);
  return hits[0];
};

const has = (classList: string, utility: string) =>
  new RegExp(`(^|[\\s:])${utility.replace(/[-[\]]/g, '\\$&')}($|\\s)`).test(
    classList,
  );

describe('shared Header chrome', () => {
  const source = read(HEADER);
  // `sticky top-0` is unique to the <header> itself.
  const header = () => listWith(source, 'sticky', 'top-0');

  it('caps the header at the dynamic viewport height', () => {
    // `dvh`, not `vh`: mobile browser chrome shows and hides as you scroll and
    // `100vh` is the LARGEST viewport, so a `vh` cap would still hide the last
    // rows behind the URL bar on exactly the phones this bug is about.
    expect(has(header(), 'max-h-dvh')).toBe(true);
  });

  it('lays the header out as a column so the menu can absorb the shortfall', () => {
    expect(has(header(), 'flex')).toBe(true);
    expect(has(header(), 'flex-col')).toBe(true);
  });

  it('lets the header container shrink below its content height', () => {
    // Without `min-h-0` a flex item refuses to shrink past its content, so the
    // cap above would be silently ignored and the menu would overflow again.
    const container = listWith(source, 'container');
    expect(has(container, 'min-h-0')).toBe(true);
    expect(has(container, 'flex-col')).toBe(true);
  });

  it('hides the burger at the breakpoint the close-on-desktop hook watches', () => {
    // The burger is the only control that can clear `mobileMenuOpen` by hand.
    // If it stopped hiding at exactly the width the hook watches — say someone
    // consolidated onto a stock `xl:hidden` — there would be a band where the
    // burger is gone but the hook has not fired, which is the stuck scroll lock
    // again, just narrower. Asserting the token rather than the width keeps
    // this honest even if the config value changes.
    const burger = listWith(source, 'header-desktop:hidden', 'p-2');
    expect(has(burger, `${HEADER_DESKTOP_SCREEN}:hidden`)).toBe(true);
  });

  it('never compresses the title bar itself', () => {
    // The bar holds the close button. If it shrank, the escape hatch would be
    // the first thing to go.
    expect(has(listWith(source, 'justify-between'), 'flex-shrink-0')).toBe(true);
  });
});

/**
 * Discovered rather than hardcoded: a NEW layout passing a `mobileMenu` without
 * the scroller classes would reintroduce the bug in a worse shape — the header
 * capped, the menu overflowing past it — and a fixed list would stay green.
 */
const menuOwners = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx$/.test(entry)) {
        const source = readFileSync(full, 'utf8');
        if (source.includes('shared/Header') && source.includes('mobileMenu=')) {
          found.push(relative(REPO_ROOT, full).split(sep).join('/'));
        }
      }
    }
  };
  for (const root of ['app', 'components']) walk(join(REPO_ROOT, root));
  return found;
};

describe('mobile menu owners', () => {
  const owners = menuOwners();

  it('finds the layouts that own a mobile menu', () => {
    // A guard on the guard: if the discovery above silently matched nothing,
    // every assertion below would vacuously pass.
    expect(owners.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(owners)('%s', (path) => {
    const source = read(path);
    const menu = () => {
      const match = source.match(/mobileMenu=\{\s*<nav\s+className="([^"]+)"/);
      expect(match).toBeTruthy();
      return match![1];
    };

    it('scrolls its own overflow', () => {
      expect(has(menu(), 'overflow-y-auto')).toBe(true);
    });

    it('hides at the breakpoint the close-on-desktop hook watches', () => {
      // Pins the third corner of the triangle: the config feeds the hook's
      // query, and both the menu and the burger must disappear at that same
      // token. Move any one of them alone and this suite goes red.
      expect(has(menu(), `${HEADER_DESKTOP_SCREEN}:hidden`)).toBe(true);
    });

    it('can shrink below its content height', () => {
      expect(has(menu(), 'min-h-0')).toBe(true);
    });

    it('does not chain its scroll to the locked page behind it', () => {
      expect(has(menu(), 'overscroll-contain')).toBe(true);
    });

    it('still locks the page behind the open menu', () => {
      // The lock is correct and load-bearing. Closing the menu when the
      // viewport crosses to desktop is a fine fix for the stuck-lock case;
      // deleting the lock is not, and would not make the menu any more
      // reachable either.
      expect(source).toMatch(/mobileMenuOpen[\s\S]{0,120}overflow\s*=\s*'hidden'/);
    });

    it('closes the menu when the viewport crosses to desktop', () => {
      // Both the menu and the burger that closes it are `header-desktop:hidden`.
      // Cross the breakpoint with the menu open and every control capable of
      // clearing `mobileMenuOpen` is `display: none` — while the lock asserted
      // above is still on the body. The page then cannot scroll until a reload.
      // Closing it on the media-query change is what keeps the lock reversible.
      expect(source).toContain('useCloseMobileMenuOnDesktop');
      expect(source).toMatch(
        /useCloseMobileMenuOnDesktop\(\s*setMobileMenuOpen\s*\)/,
      );
    });

    it('clears the chat FAB off the menu while it is open', () => {
      // The menu's last row (sign in / sign out) now rests exactly at the
      // bottom edge, which is where the FAB is pinned — it stole that row's
      // taps until this class started being applied.
      expect(source).toMatch(/classList\.toggle\('mobile-menu-open', mobileMenuOpen\)/);
      expect(source).toMatch(/classList\.remove\('mobile-menu-open'\)/);
    });
  });
});

/**
 * The one part of this bug jsdom CAN prove, because it is state rather than
 * layout: crossing the breakpoint must clear `mobileMenuOpen`. jsdom ships no
 * `matchMedia` at all, so the hook gets a stub whose `matches` we flip by hand
 * and whose listeners we can count.
 */
const stubMatchMedia = () => {
  const listeners = new Set<() => void>();
  const mql = {
    matches: false,
    addEventListener: jest.fn((event: string, listener: () => void) => {
      if (event === 'change') listeners.add(listener);
    }),
    removeEventListener: jest.fn((event: string, listener: () => void) => {
      if (event === 'change') listeners.delete(listener);
    }),
  };
  const matchMedia = jest.fn(() => mql as unknown as MediaQueryList);
  Object.defineProperty(window, 'matchMedia', {
    value: matchMedia,
    configurable: true,
    writable: true,
  });
  return {
    matchMedia,
    mql,
    listenerCount: () => listeners.size,
    /** What a real browser does on a resize across the breakpoint. */
    resizeTo: (matches: boolean) =>
      act(() => {
        mql.matches = matches;
        listeners.forEach((listener) => listener());
      }),
  };
};

describe('closing the mobile menu at the desktop breakpoint', () => {
  it('closes an open menu when the viewport crosses to desktop', () => {
    // The bug, reproduced: open at 390px wide, resize to 1400px, and the body
    // stays `overflow: hidden` with no visible control left to undo it.
    const media = stubMatchMedia();
    const setMobileMenuOpen = jest.fn();

    renderHook(() => useCloseMobileMenuOnDesktop(setMobileMenuOpen));
    setMobileMenuOpen.mockClear();
    media.resizeTo(true);

    expect(setMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it('leaves the menu alone while the viewport is still mobile', () => {
    // Resizing 390px -> 500px keeps the burger on screen, so the menu is still
    // reachable and closing it would just yank it out from under the customer.
    const media = stubMatchMedia();
    const setMobileMenuOpen = jest.fn();

    renderHook(() => useCloseMobileMenuOnDesktop(setMobileMenuOpen));
    setMobileMenuOpen.mockClear();
    media.resizeTo(false);

    expect(setMobileMenuOpen).not.toHaveBeenCalled();
  });

  it('closes on mount if the viewport is already desktop', () => {
    // Holds the invariant as "never open at desktop" rather than the narrower
    // "closes on a change", so a menu restored open by any future means still
    // cannot strand the lock.
    const media = stubMatchMedia();
    media.mql.matches = true;
    const setMobileMenuOpen = jest.fn();

    renderHook(() => useCloseMobileMenuOnDesktop(setMobileMenuOpen));

    expect(setMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it('stops listening once the layout unmounts', () => {
    const media = stubMatchMedia();

    const { unmount } = renderHook(() =>
      useCloseMobileMenuOnDesktop(jest.fn()),
    );
    expect(media.listenerCount()).toBe(1);
    unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it('does not resubscribe on every render', () => {
    // Given a stable argument the listener is registered once. That the CALL
    // SITES actually pass one — the `useState` setter rather than an inline
    // arrow — is a separate claim, held by the source-level assertion in
    // 'closes the menu when the viewport crosses to desktop' above.
    const media = stubMatchMedia();
    const setMobileMenuOpen = jest.fn();

    const { rerender } = renderHook(() =>
      useCloseMobileMenuOnDesktop(setMobileMenuOpen),
    );
    rerender();
    rerender();

    expect(media.mql.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('watches exactly the `header-desktop` breakpoint tailwind hides the menu at', () => {
    // The companion assertions above pin the menu and the burger to the
    // `header-desktop:hidden` TOKEN; this one pins the hook's query to the
    // WIDTH that token resolves to. Together they mean the hook fires at
    // exactly the width the two controls vanish at. Retune the config and all
    // three move as one; retune only one of them and this suite goes red.
    expect(headerDesktopWidth).toMatch(/^\d+px$/);
    expect(HEADER_DESKTOP_QUERY).toBe(`(min-width: ${headerDesktopWidth})`);
  });
});

describe('chat FAB', () => {
  it('is hidden while the mobile menu is open', () => {
    // Keyed off `[data-chat-fab]`, matching the two rules already in the file,
    // so it cannot silently stop matching if ChatButton's spacing is retuned.
    expect(read('app/globals.css')).toMatch(
      /body\.mobile-menu-open\s+\[data-chat-fab\]\s*\{[^}]*display:\s*none\s*!important/,
    );
  });
});

describe('tailwind', () => {
  it('is new enough to emit the viewport-unit utilities', () => {
    // `max-h-dvh` landed in Tailwind 3.4. On an older resolution Tailwind emits
    // NOTHING for it — no error, no class — and the header cap silently
    // vanishes while every other assertion here still passes.
    const [major, minor] = require('tailwindcss/package.json')
      .version.split('.')
      .map(Number);
    expect(major > 3 || (major === 3 && minor >= 4)).toBe(true);

    // And the declared range must not permit an older resolution either.
    const declared = require('../package.json').devDependencies.tailwindcss;
    expect(declared).not.toMatch(/\^3\.[0-3]\./);
  });
});
