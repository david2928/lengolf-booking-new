/**
 * Chat Messages Component
 * Displays chat messages with proper styling and animations
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Bot, User, X } from 'lucide-react';
import Image from 'next/image';
import type { ChatMessage } from '@/hooks/useChatSession';

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  error: string | null;
}

export function ChatMessages({ messages, isLoading, isTyping, error }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center p-6 text-center text-red-500">
        <MessageCircle className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const showEmptyState = !isLoading && messages.length === 0;

  return (
    <div className="flex min-h-full flex-col justify-end gap-4 p-4 py-6 md:py-4">
      {/* Loading indicator */}
      {isLoading && messages.length === 0 && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-start">
              <div className="max-w-[80%] space-y-2">
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                <div className="h-16 w-48 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {showEmptyState && (
        <div className="flex flex-1 flex-col items-center justify-center space-y-3 text-center text-gray-500">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MessageCircle className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">How can we help?</p>
            <p className="text-xs text-gray-500">We usually reply in a few minutes.</p>
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Typing indicator */}
      {isTyping && (
        <div className="flex justify-start">
          <div className="flex max-w-[80%] items-center space-x-2 rounded-lg bg-gray-100 px-4 py-2">
            <Bot className="h-4 w-4 text-gray-500" />
            <div className="flex space-x-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
              <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
              <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isCustomer = message.sender_type === 'customer';
  const isBot = message.sender_type === 'bot';

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`flex ${isCustomer ? 'justify-end' : 'justify-start'} animate-in fade-in-0 slide-in-from-bottom-1 duration-300`}>
      <div className="max-w-[85%] md:max-w-[80%]">
        {/* Sender name for bot/staff messages */}
        {!isCustomer && message.sender_name && (
          <div className="flex items-center space-x-1 mb-1 ml-1">
            {isBot ? (
              <Bot className="w-3 h-3 text-gray-500" />
            ) : (
              <User className="w-3 h-3 text-gray-500" />
            )}
            <span className="text-xs font-medium text-gray-600">
              {message.sender_name}
            </span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`overflow-hidden rounded-lg shadow-sm ${
            isCustomer
              ? 'bg-primary text-primary-foreground ml-auto'
              : 'bg-gray-100 text-gray-900'
          } ${
            message.message_type === 'image' ? 'p-2' : 'px-4 py-2'
          }`}
        >
          {message.message_type === 'image' && message.image_url ? (
            <ImageMessage
              imageUrl={message.image_url}
            />
          ) : (
            <p className="text-base md:text-sm whitespace-pre-wrap break-words">
              {message.message_text}
            </p>
          )}
        </div>

        {/* Timestamp */}
        <div className={`mt-1 ${isCustomer ? 'text-right' : 'text-left'}`}>
          <span className="text-xs text-gray-500">
            {formatTime(message.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImageMessage({ imageUrl }: { imageUrl: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="space-y-2">
        <Image
          src={imageUrl}
          alt="Image from chat"
          width={128}
          height={128}
          className="max-w-32 h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity border"
          onClick={() => setIsModalOpen(true)}
          onError={(e) => {
            console.warn('Failed to load chat image:', imageUrl);
            e.currentTarget.src = '/images/image-placeholder.png';
            e.currentTarget.alt = 'Image could not be loaded';
          }}
        />
      </div>

      {/* Full-size image modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setIsModalOpen(false)}
        >
          <div className="relative max-w-4xl max-h-4xl p-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
            <Image
              src={imageUrl}
              alt="Full size image"
              width={800}
              height={600}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}
