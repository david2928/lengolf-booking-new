/**
 * Chat Service
 * Handles website chat functionality including session and message management
 * Following the pattern established in vipService.ts
 */

import { createServerClient } from '@/utils/supabase/server';

export interface ChatSession {
  id: string;
  session_id: string;
  user_id?: string;
  customer_id?: string;
  display_name?: string;
  email?: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  session_id: string;
  is_active: boolean;
  last_message_at: string;
  last_message_text?: string;
  unread_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  session_id: string;
  message_text: string;
  sender_type: 'customer' | 'bot' | 'staff';
  sender_name?: string;
  is_read: boolean;
  created_at: string;
}

export class ChatService {
  /**
   * Initialize a new chat session
   */
  static async initializeSession(sessionId: string, userInfo?: {
    userId?: string;
    customerId?: string;
    displayName?: string;
    email?: string;
  }): Promise<{ session: ChatSession; conversation: ChatConversation }> {
    const supabase = createServerClient();

    // Create or update session
    const { data: session, error: sessionError } = await supabase
      .from('web_chat_sessions')
      .upsert({
        session_id: sessionId,
        user_id: userInfo?.userId,
        customer_id: userInfo?.customerId,
        display_name: userInfo?.displayName,
        email: userInfo?.email,
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: 'session_id'
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw new Error(`Failed to create session: ${sessionError?.message}`);
    }

    // Get or create THE SINGLE conversation for this user
    let conversation;

    if (userInfo?.userId) {
      // For logged-in users: ALWAYS use their single persistent conversation
      // Find existing conversation for this user using the user_id column
      const { data: existingConv } = await supabase
        .from('web_chat_conversations')
        .select('*')
        .eq('user_id', userInfo.userId)
        .eq('is_active', true)
        .maybeSingle(); // Should only be one due to unique constraint

      if (existingConv) {
        // Found existing conversation - update it to use current session
        const { data: updatedConv, error: updateError } = await supabase
          .from('web_chat_conversations')
          .update({
            session_id: session.id, // Link to current session
            last_message_at: new Date().toISOString(),
          })
          .eq('id', existingConv.id)
          .select()
          .single();

        if (updateError || !updatedConv) {
          throw new Error(`Failed to update conversation: ${updateError?.message}`);
        }
        conversation = updatedConv;
      } else {
        // No existing conversation - create the user's FIRST and ONLY conversation
        const { data: newConv, error: convError } = await supabase
          .from('web_chat_conversations')
          .insert({
            session_id: session.id,
            user_id: userInfo.userId, // Set user_id for direct lookup
            last_message_at: new Date().toISOString(),
            is_active: true,
          })
          .select()
          .single();

        if (convError || !newConv) {
          throw new Error(`Failed to create conversation: ${convError?.message}`);
        }
        conversation = newConv;
      }
    } else {
      // For anonymous users: session-based conversations (can have multiple)
      const { data: existingConv } = await supabase
        .from('web_chat_conversations')
        .select('*')
        .eq('session_id', session.id)
        .eq('is_active', true)
        .maybeSingle();

      if (existingConv) {
        conversation = existingConv;
      } else {
        // Create new conversation for anonymous user
        const { data: newConv, error: convError } = await supabase
          .from('web_chat_conversations')
          .insert({
            session_id: session.id,
            last_message_at: new Date().toISOString(),
            is_active: true,
          })
          .select()
          .single();

        if (convError || !newConv) {
          throw new Error(`Failed to create conversation: ${convError?.message}`);
        }
        conversation = newConv;
      }
    }

    return { session, conversation };
  }

  /**
   * Send a message
   */
  static async sendMessage(
    conversationId: string,
    sessionId: string,
    messageText: string,
    senderType: 'customer' | 'staff' = 'customer',
    senderName?: string
  ): Promise<{ message: ChatMessage }> {
    const supabase = createServerClient();

    // Insert the user message
    const { data: message, error: messageError } = await supabase
      .from('web_chat_messages')
      .insert({
        conversation_id: conversationId,
        session_id: sessionId,
        message_text: messageText,
        sender_type: senderType,
        sender_name: senderName,
        is_read: false,
      })
      .select()
      .single();

    if (messageError || !message) {
      throw new Error(`Failed to send message: ${messageError?.message}`);
    }

    // Update conversation - increment unread count for customer messages
    if (senderType === 'customer') {
      await supabase
        .rpc('increment_unread_count', { conversation_id: conversationId })
        .then(async () => {
          // Update other fields after incrementing
          await supabase
            .from('web_chat_conversations')
            .update({
              last_message_at: new Date().toISOString(),
              last_message_text: messageText,
            })
            .eq('id', conversationId);
        });
    } else {
      // For staff messages, reset unread count
      await supabase
        .from('web_chat_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_text: messageText,
          unread_count: 0,
        })
        .eq('id', conversationId);
    }

    return { message };
  }

  /**
   * Get messages for a conversation
   */
  static async getMessages(conversationId: string, limit: number = 50): Promise<ChatMessage[]> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('web_chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Update session last seen timestamp
   */
  static async updateLastSeen(sessionId: string): Promise<void> {
    const supabase = createServerClient();

    await supabase
      .from('web_chat_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }

  /**
   * Mark messages as read
   */
  static async markMessagesAsRead(conversationId: string): Promise<void> {
    const supabase = createServerClient();

    await supabase
      .from('web_chat_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false);

    // Reset unread count
    await supabase
      .from('web_chat_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
  }
}