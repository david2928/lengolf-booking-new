'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

interface HeaderProps {
  title: string;
  badge?: {
    text: string;
    href: string;
  };
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  rightContent: ReactNode;
  mobileMenu?: ReactNode;
  /** Slimmer bar on mobile (full height restored at the desktop breakpoint). */
  compact?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  title,
  badge,
  mobileMenuOpen,
  onToggleMobileMenu,
  rightContent,
  mobileMenu,
  compact,
}) => {
  return (
    // The mobile menu opens *inside* this header, and the page behind it is
    // scroll-locked while it is open. A sticky element pinned at top:0 cannot be
    // scrolled to, so a menu taller than the screen would be unreachable. Capping
    // the header at the dynamic viewport height and laying it out as a column
    // lets the menu take whatever is left over and scroll itself instead.
    <header className={`bg-primary text-primary-foreground sticky top-0 z-50 shadow-md flex flex-col max-h-dvh ${compact ? 'py-2 header-desktop:py-4' : 'py-4'}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col min-h-0">
        <div className="flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-shrink">
            <h1 className={`font-bold text-white flex-shrink-0 ${compact ? 'text-xl header-desktop:text-2xl' : 'text-2xl'}`}>
              {title}
            </h1>
            {badge && (
              <Link
                href={badge.href}
                className="bg-white text-green-700 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap flex-shrink-0"
              >
                {badge.text}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {rightContent}
            
            <button
              className="header-desktop:hidden p-2 text-white hover:bg-white/10 rounded-md"
              onClick={onToggleMobileMenu}
              aria-label="Toggle main menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        
        {mobileMenuOpen && mobileMenu}
      </div>
    </header>
  );
};

export default Header; 