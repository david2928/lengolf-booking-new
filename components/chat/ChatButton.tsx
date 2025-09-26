/**
 * Chat Button Component
 * Floating messenger-style button following the TOPKART Bangkok design
 */

'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ChatButtonProps {
  onClick: () => void;
  unreadCount: number;
}

export function ChatButton({ onClick, unreadCount }: ChatButtonProps) {
  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
      <Button
        onClick={onClick}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary p-0 shadow-lg transition-all duration-300 hover:scale-110 hover:bg-primary/90"
        size="sm"
        aria-label="Open chat"
      >
        {/* Facebook Messenger style icon - made significantly larger */}
        <svg
          className="text-primary-foreground"
          fill="currentColor"
          viewBox="0 0 16 16"
          style={{ width: '25px', height: '25px' }}
        >
          {/* Official Bootstrap Messenger icon path */}
          <path d="M0 7.76C0 3.301 3.493 0 8 0s8 3.301 8 7.76-3.493 7.76-8 7.76c-.81 0-1.586-.107-2.316-.307a.64.64 0 0 0-.427.03l-1.588.702a.64.64 0 0 1-.898-.566l-.044-1.423a.64.64 0 0 0-.215-.456C.956 12.108 0 10.092 0 7.76m5.546-1.459-2.35 3.728c-.225.358.214.761.551.506l2.525-1.916a.48.48 0 0 1 .578-.002l1.869 1.402a1.2 1.2 0 0 0 1.735-.32l2.35-3.728c.226-.358-.214-.761-.551-.506L9.728 7.381a.48.48 0 0 1-.578.002L7.281 5.98a1.2 1.2 0 0 0-1.735.32z"/>
        </svg>

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full p-0 text-xs font-bold"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
    </div>
  );
}
