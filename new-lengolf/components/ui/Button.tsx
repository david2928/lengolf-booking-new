'use client';

import { ButtonHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'google' | 'facebook' | 'line' | 'guest';
  isLoading?: boolean;
}

export function Button({
  children,
  className,
  variant = 'primary',
  isLoading = false,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'w-full rounded-md px-4 py-2.5 text-center text-sm font-medium shadow-sm disabled:opacity-50 transition-colors';
  
  const variants = {
    primary: 'bg-green-700 text-white hover:bg-green-800',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700',
    outline: 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
    google: 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
    facebook: 'bg-[#1877F2] text-white hover:bg-[#166FE5]',
    line: 'bg-[#00B900] text-white hover:bg-[#00A000]',
    guest: 'bg-gray-600 text-white hover:bg-gray-700',
  };

  return (
    <button
      className={twMerge(baseStyles, variants[variant], className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? 'Please wait...' : children}
    </button>
  );
} 