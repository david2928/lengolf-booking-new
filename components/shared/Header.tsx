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
}

const Header: React.FC<HeaderProps> = ({
  title,
  badge,
  mobileMenuOpen,
  onToggleMobileMenu,
  rightContent,
  mobileMenu,
}) => {
  return (
    <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">
              {title}
            </h1>
            {badge && (
              <Link href={badge.href} className="bg-white text-green-700 px-3 py-1.5 rounded-md text-sm font-medium">
                {badge.text}
              </Link>
            )}
          </div>
          
          <div className="flex items-center gap-2">
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