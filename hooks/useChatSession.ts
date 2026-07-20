/**
 * Chat Session Hook
 * Manages chat session state and operations
 * Following the pattern established in useMediaQuery.ts
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { mergeMessages, diffNew, countUnread } from '@/lib/chatPolling';

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

export function useChatSession(options?: { skip?: boolean; autoConnect?: boolean }) {
  const { skip = false, autoConnect = false } = options || {};
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

  // Coalesce concurrent initialize calls (e.g. handleOpen + autoConnect effect
  // firing in the same tick) onto a single in-flight promise. Prevents two
  // POSTs racing the unique-active-conversation-per-user index.
  const initInFlight = useRef<Promise<void> | null>(null);

  // Mirror of `messages` for the polling loop, so poll ticks can diff
  // against current state without going through a setState updater
  // (side effects inside updaters break under StrictMode double-invoke).
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

    // If an init is already in-flight (e.g. handleOpen fired immediately and
    // the autoConnect effect re-fires on the same tick), reuse that promise.
    if (initInFlight.current) {
      return initInFlight.current;
    }

    setIsLoading(true);
    setError(null);

    const run = (async () => {
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
    })();

    initInFlight.current = run;
    try {
      await run;
    } finally {
      initInFlight.current = null;
    }
  }, [chatSession.isInitialized, session, getSessionId, status]);

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

      // Echo the persisted row(s) immediately so the sender's own bubble
      // (and any out-of-hours auto-reply) doesn't wait for the next poll.
      // mergeMessages dedupes by id when the poll returns the same rows.
      const data = await response.json();
      const echoed: ChatMessage[] = [
        ...(data.message ? [data.message] : []),
        ...(data.autoReply ? [data.autoReply] : []),
      ];
      if (echoed.length > 0) {
        setMessages((prev) => mergeMessages(prev, echoed));
      }
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

  // Poll for new messages. Replaces the former anon-key realtime
  // subscription: anon SELECT on web_chat_messages was revoked in the
  // 2026-07 Supabase security hardening, so the widget now fetches through
  // the ownership-checked /api/chat/messages route instead.
  useEffect(() => {
    if (skip) return; // Skip on LIFF pages
    if (!chatSession.conversationId) return;

    const POLL_VISIBLE_MS = 3000;
    const POLL_HIDDEN_MS = 15000;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: chatSession.conversationId,
            sessionId: chatSession.sessionId,
          }),
        });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          const incoming: ChatMessage[] = data.messages || [];
          const added = diffNew(messagesRef.current, incoming);
          if (added.length > 0) {
            setMessages((prev) => mergeMessages(prev, incoming));
            // Clear typing indicator once the bot's reply lands.
            if (added.some((m) => m.sender_type === 'bot')) {
              setIsTyping(false);
            }
          }
          setUnreadCount(countUnread(incoming));
        }
      } catch {
        // Network hiccup — the next tick retries.
      } finally {
        if (!cancelled) {
          const interval =
            typeof document !== 'undefined' && document.visibilityState === 'hidden'
              ? POLL_HIDDEN_MS
              : POLL_VISIBLE_MS;
          timer = setTimeout(poll, interval);
        }
      }
    };

    poll();

    // Immediate catch-up poll when the tab becomes visible again.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        if (timer) clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [skip, chatSession.conversationId, chatSession.sessionId]);

  // Reset chat session when user session changes (login/logout)
  useEffect(() => {
    if (skip) return; // Skip on LIFF pages
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

  // Auto-initialize on mount and when session changes (only if autoConnect is enabled)
  useEffect(() => {
    if (skip || !autoConnect) return;
    if (!chatSession.isInitialized && status !== 'loading') {
      // For logged-in users, always initialize (they have persistent session)
      // For anonymous users, only if they have a localStorage session
      const shouldInitialize = session?.user?.id || localStorage.getItem('chat_session_id');

      if (shouldInitialize) {
        initializeChat();
      }
    }
  }, [initializeChat, chatSession.isInitialized, session?.user?.id, status, autoConnect]);

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
