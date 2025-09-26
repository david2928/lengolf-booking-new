/**
 * Chat Send Message API Route
 * Handles message sending for website chat
 * Following the pattern established in the VIP API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatService } from '@/lib/chatService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, sessionId, message, senderType = 'customer', senderName } = body;

    // Enhanced input validation
    if (!conversationId || !sessionId || !message) {
      return NextResponse.json(
        { error: 'Conversation ID, session ID, and message are required' },
        { status: 400 }
      );
    }

    // Validate data types and formats
    if (typeof conversationId !== 'string' || !conversationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      return NextResponse.json(
        { error: 'Invalid conversation ID format' },
        { status: 400 }
      );
    }

    if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || sessionId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid session ID' },
        { status: 400 }
      );
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message must be a non-empty string' },
        { status: 400 }
      );
    }

    if (message.trim().length > 1000) {
      return NextResponse.json(
        { error: 'Message is too long (maximum 1000 characters)' },
        { status: 400 }
      );
    }

    // Validate sender type
    if (!['customer', 'staff', 'bot'].includes(senderType)) {
      return NextResponse.json(
        { error: 'Invalid sender type' },
        { status: 400 }
      );
    }

    // Validate sender name if provided
    if (senderName && (typeof senderName !== 'string' || senderName.length > 100)) {
      return NextResponse.json(
        { error: 'Invalid sender name' },
        { status: 400 }
      );
    }

    // Get current session for authentication context
    const session = await getServerSession(authOptions);
    const supabase = createServerClient();

    // Verify conversation ownership before allowing message sending
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

    // Verify the user has permission to send messages to this conversation
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

    // Verify conversation is active
    if (!conversation.is_active) {
      return NextResponse.json(
        { error: 'Conversation is not active' },
        { status: 403 }
      );
    }

    // Send message
    const result = await ChatService.sendMessage(
      conversationId,
      sessionId,
      message.trim(),
      senderType,
      senderName
    );

    // Update last seen timestamp
    await ChatService.updateLastSeen(sessionId);

    return NextResponse.json({
      success: true,
      message: result.message,
    });

  } catch (error) {
    console.error('Error sending message:', error);

    return NextResponse.json(
      {
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}