'use client';

import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Must stay in step with the `header-desktop` screen in `tailwind.config.ts`.
 * Guarded by `__tests__/mobile-nav-scroll.test.ts`, which reads the width back
 * out of the config rather than trusting this constant.
 */
export const HEADER_DESKTOP_QUERY = '(min-width: 1300px)';

/**
 * Closes the mobile navigation menu once the viewport reaches the desktop
 * breakpoint.
 *
 * The menu and the burger that toggles it are both `header-desktop:hidden`, and
 * an open menu locks the page with `document.body.style.overflow = 'hidden'`.
 * Crossing the breakpoint while it is open therefore hides every control that
 * could clear `mobileMenuOpen` and leaves the lock behind it — the page stays
 * unscrollable until a reload. Closing the menu here keeps the lock reversible;
 * the lock itself is load-bearing and stays.
 *
 * Pass the `useState` setter directly. Its identity is stable, so the listener
 * is registered once instead of being torn down and re-added on every render.
 */
export function useCloseMobileMenuOnDesktop(
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>,
): void {
  useEffect(() => {
    const mediaQueryList = window.matchMedia(HEADER_DESKTOP_QUERY);

    const closeIfDesktop = () => {
      if (mediaQueryList.matches) setMobileMenuOpen(false);
    };

    // Not only on change: the invariant is "never open at desktop", so a menu
    // that somehow mounts open above the breakpoint closes too.
    closeIfDesktop();
    mediaQueryList.addEventListener('change', closeIfDesktop);

    return () => {
      mediaQueryList.removeEventListener('change', closeIfDesktop);
    };
  }, [setMobileMenuOpen]);
}
