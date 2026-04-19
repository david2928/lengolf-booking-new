/**
 * Chat Window Component
 * Main chat popup window following TOPKART Bangkok design patterns
 */

'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import type { ChatMessage, ChatSession } from '@/hooks/useChatSession';
import { getBusinessHoursStatus } from '@/lib/businessHours';

interface ChatWindowProps {
  onClose: () => void;
  chatSession: ChatSession;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
  sendMessage: (message: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  initializeChat: () => Promise<void>;
}

export function ChatWindow({
  onClose,
  chatSession,
  messages,
  isLoading,
  error,
  isTyping,
  sendMessage,
  markAsRead,
  initializeChat,
}: ChatWindowProps) {
  const t = useTranslations('chat');
  const isBusinessHours = getBusinessHoursStatus().isOpen;
  const headerSubtitle = isBusinessHours ? t('headerReplyWithin') : t('headerBusinessHours');
  // Ensure session is ready as soon as the window opens
  useEffect(() => {
    void initializeChat();
  }, [initializeChat]);

  // Lock body scroll while the chat is open so mobile swipes inside the
  // fixed-overlay window don't bleed through and scroll the page underneath.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Mark messages from staff/bot as read while the window is open
  useEffect(() => {
    if (!chatSession.conversationId) {
      return;
    }

    const hasIncomingUnread = messages.some(
      (message) => message.sender_type !== 'customer' && !message.is_read,
    );

    if (!hasIncomingUnread) {
      return;
    }

    void markAsRead();
  }, [chatSession.conversationId, messages, markAsRead]);

  const hasActiveConversation = Boolean(chatSession.conversationId);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) {
      return;
    }

    if (!hasActiveConversation) {
      await initializeChat();
    }

    await sendMessage(text.trim());
  };

  return (
    <div className="fixed z-50
      /* Mobile: Full screen with slide-up animation */
      inset-0 md:inset-auto
      /* Desktop: Floating bottom-right */
      md:bottom-6 md:right-6 md:w-96 md:max-w-md
      animate-in slide-in-from-bottom-full duration-300 md:slide-in-from-bottom-4
    ">
      <div className="flex flex-col overflow-hidden bg-white shadow-2xl
        /* Mobile: Full screen, no border/radius */
        h-full md:h-[28rem] md:max-h-[calc(100vh-3rem)]
        /* Desktop: Rounded with border */
        md:rounded-lg md:border md:border-gray-200
      ">
        {/* Header */}
        <div className="flex items-center justify-between bg-primary p-4 py-6 md:py-4 text-primary-foreground">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-full bg-white">
              <MessageCircle className="h-6 w-6 md:h-5 md:w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base md:text-sm font-semibold">{t('brandName')}</h3>
              <p className="text-sm md:text-xs opacity-90">{headerSubtitle}</p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-primary-foreground hover:bg-primary/80 md:h-8 md:w-8"
          >
            <X className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden bg-white">
          <div className="h-full overflow-y-auto bg-white">
            <ChatMessages
              messages={messages}
              isLoading={isLoading}
              isTyping={isTyping}
              error={error}
            />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={!chatSession.isInitialized}
          />
        </div>
      </div>
    </div>
  );
}
