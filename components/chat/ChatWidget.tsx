/**
 * Chat Widget Component
 * Main chat widget following the VIP component patterns
 * Provides messenger-style chat interface like TOPKART Bangkok reference
 */

'use client';

import { useState } from 'react';
import { ChatButton } from './ChatButton';
import { ChatWindow } from './ChatWindow';
import { useChatSession } from '@/hooks/useChatSession';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
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
  } = useChatSession();

  const handleOpen = () => {
    setIsOpen(true);
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
