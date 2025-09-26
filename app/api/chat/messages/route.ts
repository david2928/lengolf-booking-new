/**
 * Chat Messages API Route
 * Fetches messages for a conversation with proper authorization
 * Works for both authenticated and anonymous users
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, sessionId } = body;

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        { error: 'Valid conversation ID is required' },
        { status: 400 }
      );
    }

    // Get current session for authorization
    const session = await getServerSession(authOptions);
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify conversation ownership before fetching messages
    const { data: conversation, error: convError } = await supabase
      .from('web_chat_conversations')
      .select('id, user_id, session_id, is_active')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 403 }
      );
    }

    // Verify the user has permission to access this conversation
    if (session?.user?.id) {
      // For authenticated users: must own the conversation
      if (conversation.user_id !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied: conversation belongs to different user' },
          { status: 403 }
        );
      }
    } else {
      // For anonymous users: verify session ownership through web_chat_sessions
      if (!sessionId) {
        return NextResponse.json(
          { error: 'Session ID required for anonymous users' },
          { status: 400 }
        );
      }

      const { data: sessionData } = await supabase
        .from('web_chat_sessions')
        .select('session_id')
        .eq('id', conversation.session_id)
        .single();

      if (!sessionData || sessionData.session_id !== sessionId) {
        return NextResponse.json(
          { error: 'Access denied: session mismatch' },
          { status: 403 }
        );
      }
    }

    // Fetch messages using service role (bypasses RLS)
    const { data: messages, error: messagesError } = await supabase
      .from('web_chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (messagesError) {
      throw new Error(`Failed to fetch messages: ${messagesError.message}`);
    }

    return NextResponse.json({
      success: true,
      messages: messages || [],
    });

  } catch (error) {
    console.error('Error fetching messages:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}