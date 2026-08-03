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
 * markup exactly as happily as against the fixed one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const HEADER = 'components/shared/Header.tsx';

/** Every layout that feeds a `mobileMenu` into the shared Header. */
const MENU_OWNERS = [
  'app/[locale]/(features)/bookings/components/booking/Layout.tsx',
  'app/[locale]/(features)/vip/layout.tsx',
];

describe('shared Header chrome', () => {
  const source = read(HEADER);

  /** The `<header>` element's class list, whether or not it interpolates. */
  const headerClasses = (): string => {
    const match = source.match(/<header\s+className=\{`([^`]+)`\}/);
    expect(match).toBeTruthy();
    return match![1];
  };

  it('caps the header at the dynamic viewport height', () => {
    // `dvh`, not `vh`: mobile browser chrome shows and hides as you scroll, and
    // `100vh` is the *largest* viewport, so a `vh` cap still hides the last
    // rows behind the URL bar on exactly the phones this bug is about.
    expect(headerClasses()).toMatch(/\bmax-h-dvh\b/);
  });

  it('lays the header out as a column so the menu can absorb the shortfall', () => {
    const classes = headerClasses();
    expect(classes).toMatch(/\bflex\b/);
    expect(classes).toMatch(/\bflex-col\b/);
  });

  it('lets the header container shrink below its content height', () => {
    // Without `min-h-0` a flex item refuses to shrink past its content, so the
    // cap above would be silently ignored and the menu would overflow again.
    const container = source.match(/<div className="(container[^"]*)"/);
    expect(container).toBeTruthy();
    expect(container![1]).toMatch(/\bmin-h-0\b/);
    expect(container![1]).toMatch(/\bflex-col\b/);
  });

  it('never compresses the title bar itself', () => {
    // The bar holds the close button. If it shrank, the escape hatch would be
    // the first thing to go.
    const bar = source.match(/<div className="flex justify-between items-center[^"]*"/);
    expect(bar).toBeTruthy();
    expect(bar![0]).toMatch(/\bflex-shrink-0\b/);
  });
});

describe.each(MENU_OWNERS)('mobile menu in %s', (path) => {
  const source = read(path);

  /** The `<nav>` opening the `mobileMenu` prop. */
  const menuClasses = (): string => {
    const match = source.match(/mobileMenu=\{\s*<nav className="([^"]+)"/);
    expect(match).toBeTruthy();
    return match![1];
  };

  it('scrolls its own overflow', () => {
    expect(menuClasses()).toMatch(/\boverflow-y-auto\b/);
  });

  it('can shrink below its content height', () => {
    expect(menuClasses()).toMatch(/\bmin-h-0\b/);
  });

  it('does not chain its scroll to the locked page behind it', () => {
    expect(menuClasses()).toMatch(/\boverscroll-contain\b/);
  });

  it('still locks the page behind the open menu', () => {
    // The lock is correct and load-bearing — this guards against someone
    // "fixing" the reachability bug by deleting it, which would let the page
    // creep behind the menu without making the menu any more reachable.
    expect(source).toMatch(/mobileMenuOpen[\s\S]{0,120}overflow\s*=\s*'hidden'/);
  });
});
