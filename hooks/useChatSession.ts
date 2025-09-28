/**
 * Chat Session Hook
 * Manages chat session state and operations
 * Following the pattern established in useMediaQuery.ts
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useSession } from 'next-auth/react';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  session_id: string;
  message_text: string;
  message_type?: 'text' | 'image';
  image_url?: string;
  sender_type: 'customer' | 'bot' | 'staff';
  sender_name?: string;
  is_read: boolean;
  created_at: string;
}

export interface ChatSession {
  sessionId: string;
  conversationId?: string;
  isInitialized: boolean;
  isConnected: boolean;
}

export function useChatSession() {
  const { data: session, status } = useSession();
  const [chatSession, setChatSession] = useState<ChatSession>({
    sessionId: '',
    isInitialized: false,
    isConnected: false,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  const supabase = createClient();

  // Generate or retrieve session ID
  const getSessionId = useCallback(() => {
    // Only for authenticated users with valid session
    if (session?.user?.id && status === 'authenticated') {
      return `user_${session.user.id}`;
    }

    // For anonymous users, use localStorage session ID
    let sessionId = localStorage.getItem('chat_session_id');
    if (!sessionId) {
      sessionId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('chat_session_id', sessionId);
    }
    return sessionId;
  }, [session?.user?.id, status]);

  // Initialize chat session
  const initializeChat = useCallback(async () => {
    if (chatSession.isInitialized) return;

    // Don't initialize if session is still loading
    if (status === 'loading') {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sessionId = getSessionId();

      // Initialize session via API
      const response = await fetch('/api/chat/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          userInfo: session?.user ? {
            userId: session.user.id,
            displayName: session.user.name,
            email: session.user.email,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Chat initialization failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Failed to initialize chat: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      setChatSession({
        sessionId,
        conversationId: data.conversation.id,
        isInitialized: true,
        isConnected: true,
      });

      // Load existing messages immediately using API route (works for both auth and anon users)
      if (data.conversation.id) {
        try {
          const messagesResponse = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              conversationId: data.conversation.id,
              sessionId: sessionId,
            }),
          });

          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            setMessages(messagesData.messages || []);

            // Count unread messages from bot/staff
            const unreadMessages = (messagesData.messages || []).filter(
              (msg: ChatMessage) => !msg.is_read && msg.sender_type !== 'customer'
            );
            setUnreadCount(unreadMessages.length);
          } else {
            console.warn('Failed to load initial messages:', messagesResponse.status);
          }
        } catch (msgErr) {
          console.error('Error loading initial messages:', msgErr);
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize chat');
      console.error('Chat initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [chatSession.isInitialized, session, getSessionId, supabase]);

  // Load messages for conversation using API route
  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          sessionId: chatSession.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();
      setMessages(data.messages || []);

      // Count unread messages from bot/staff
      const unreadMessages = (data.messages || []).filter(
        (msg: ChatMessage) => !msg.is_read && msg.sender_type !== 'customer'
      );
      setUnreadCount(unreadMessages.length);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, [chatSession.sessionId]);

  // Send message
  const sendMessage = useCallback(async (messageText: string) => {
    if (!chatSession.conversationId || !messageText.trim()) return;

    setIsTyping(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: chatSession.conversationId,
          sessionId: chatSession.sessionId,
          message: messageText.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Message will be received via real-time subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsTyping(false);
    }
  }, [chatSession.conversationId, chatSession.sessionId]);

  // Mark messages as read
  const markAsRead = useCallback(async () => {
    if (!chatSession.conversationId) return;

    try {
      await fetch('/api/chat/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: chatSession.conversationId,
        }),
      });

      setMessages(prev =>
        prev.map(message =>
          message.sender_type === 'customer'
            ? message
            : { ...message, is_read: true }
        )
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark messages as read:', err);
    }
  }, [chatSession.conversationId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!chatSession.conversationId) return;

    const channel = supabase
      .channel(`chat-${chatSession.conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'web_chat_messages',
          filter: `conversation_id=eq.${chatSession.conversationId}`,
        },
        (payload: any) => {
          try {
            const newMessage = payload.new as ChatMessage;

            // Validate message data before processing
            if (!newMessage || !newMessage.id) {
              console.warn('Invalid message received:', payload);
              return;
            }

            setMessages(prev => {
              // Avoid duplicates
              if (prev.find(msg => msg.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
            });

            // Update unread count for non-customer messages
            if (newMessage.sender_type !== 'customer') {
              setUnreadCount(prev => prev + 1);
            }

            // Clear typing indicator when bot responds
            if (newMessage.sender_type === 'bot') {
              setIsTyping(false);
            }
          } catch (error) {
            console.error('Error processing real-time message:', error, payload);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatSession.conversationId, supabase]);

  // Reset chat session when user session changes (login/logout)
  useEffect(() => {
    const currentSessionId = getSessionId();

    // If session ID changed (user logged in/out), reset chat session
    if (chatSession.isInitialized && chatSession.sessionId !== currentSessionId) {
      // Clear localStorage chat session when logging out
      if (status === 'unauthenticated') {
        localStorage.removeItem('chat_session_id');
      }

      setChatSession({
        sessionId: '',
        isInitialized: false,
        isConnected: false,
      });
      setMessages([]);
      setUnreadCount(0);
      setError(null);
    }
  }, [session?.user?.id, status, chatSession.isInitialized, chatSession.sessionId, getSessionId]);

  // Auto-initialize on mount and when session changes
  useEffect(() => {
    if (!chatSession.isInitialized && status !== 'loading') {
      // For logged-in users, always initialize (they have persistent session)
      // For anonymous users, only if they have a localStorage session
      const shouldInitialize = session?.user?.id || localStorage.getItem('chat_session_id');

      if (shouldInitialize) {
        initializeChat();
      }
    }
  }, [initializeChat, chatSession.isInitialized, session?.user?.id, status]);

  return {
    // Session state
    chatSession,
    isLoading,
    error,

    // Messages
    messages,
    unreadCount,
    isTyping,

    // Actions
    sendMessage,
    markAsRead,
    initializeChat,
  };
}
