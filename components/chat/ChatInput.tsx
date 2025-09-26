/**
 * Chat Input Component
 * Message input field with send functionality
 */

'use client';

import { useState, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 pb-6 md:pb-4">
      <div className="flex space-x-2">
        <Input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={disabled || isSending}
          className="flex-1 border-gray-300 focus:border-primary focus:ring-primary h-12 md:h-10 text-base md:text-sm"
          maxLength={1000}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled || isSending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 h-12 md:h-10 md:px-3"
          size="sm"
        >
          <Send className="h-5 w-5 md:h-4 md:w-4" />
        </Button>
      </div>

      {/* Character count */}
      {message.length > 800 && (
        <div className="text-xs text-gray-500 mt-1 text-right">
          {message.length}/1000
        </div>
      )}
    </div>
  );
}