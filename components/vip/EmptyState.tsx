'use client';

import React, { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LucideIcon, PackageSearch, CalendarOff, Info, SearchX } from 'lucide-react'; // Added SearchX

interface EmptyStateProps {
  Icon?: LucideIcon;
  title: string;
  message: ReactNode; // Allow for more complex messages, e.g. with links
  action?: {
    text: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  Icon = SearchX, // Default icon
  title,
  message,
  action,
  className = ''
}) => {
  return (
    <div className={`text-center py-10 bg-card border rounded-lg p-8 shadow-sm ${className}`}>
      <Icon size={48} className="mx-auto text-primary mb-4" />
      <h3 className="text-xl font-semibold mb-2 text-card-foreground">{title}</h3>
      {typeof message === 'string' ? (
        <p className="text-muted-foreground mb-6 whitespace-pre-line">{message}</p>
      ) : (
        <div className="text-muted-foreground mb-6">{message}</div>
      )}
      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link href={action.href}>
              <Button variant="default">{action.text}</Button>
            </Link>
          ) : action.onClick ? (
            <Button variant="default" onClick={action.onClick}>
              {action.text}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export { PackageSearch, CalendarOff, Info }; // Export common icons for convenience
export default EmptyState; 