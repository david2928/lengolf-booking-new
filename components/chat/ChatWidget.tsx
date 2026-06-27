/**
 * Chat Widget Component
 * Main chat widget following the VIP component patterns
 * Provides messenger-style chat interface like TOPKART Bangkok reference
 */

'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChatButton } from './ChatButton';
import { ChatWindow } from './ChatWindow';
import { useChatSession } from '@/hooks/useChatSession';

export default function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Only show chat on the bookings landing page (/bookings and locale-prefixed equivalents)
  // e.g. /bookings, /th/bookings, /ko/bookings, /ja/bookings, /zh/bookings, or root /
  const isLiffPage = pathname?.startsWith('/liff');
  const isBookingsPage = pathname
    ? /^\/(th|ko|ja|zh)?(\/bookings)?\/?$/.test(pathname)
    : false;
  const shouldHide = isLiffPage || !isBookingsPage;

  const {
    chatSession,
    messages,
    isLoading,
    error,
    isTyping,
    unreadCount,
    markAsRead,
    sendMessage,
    initializeChat,
  } = useChatSession({ skip: shouldHide, autoConnect: isOpen });

  if (shouldHide) {
    return null;
  }

  const handleOpen = () => {
    setIsOpen(true);
    if (!chatSession.isInitialized) {
      initializeChat();
    }
    if (unreadCount > 0) {
      void markAsRead();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Chat Button - Always visible when chat is closed */}
      {!isOpen && (
        <ChatButton
          onClick={handleOpen}
          unreadCount={unreadCount}
        />
      )}

      {/* Chat Window - Shown when open */}
      {isOpen && (
        <ChatWindow
          onClose={handleClose}
          chatSession={chatSession}
          messages={messages}
          isLoading={isLoading}
          error={error}
          isTyping={isTyping}
          sendMessage={sendMessage}
          markAsRead={markAsRead}
          initializeChat={initializeChat}
        />
      )}
    </>
  );
}
