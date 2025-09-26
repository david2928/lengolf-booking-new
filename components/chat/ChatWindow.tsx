/**
 * Chat Window Component
 * Main chat popup window following TOPKART Bangkok design patterns
 */

'use client';

import { useEffect } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import type { ChatMessage, ChatSession } from '@/hooks/useChatSession';

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
  // Ensure session is ready as soon as the window opens
  useEffect(() => {
    void initializeChat();
  }, [initializeChat]);

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
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm sm:max-w-md">
      <div className="flex h-[28rem] max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-primary p-4 text-primary-foreground">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">LENGOLF Booking</h3>
              <p className="text-xs opacity-90">Chat with us</p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-primary-foreground hover:bg-primary/80"
          >
            <X className="h-4 w-4" />
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
