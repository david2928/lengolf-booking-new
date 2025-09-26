/**
 * Chat Mark Messages as Read API Route
 * Marks messages as read and resets unread count
 * Following the pattern established in the VIP API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatService } from '@/lib/chatService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId } = body;

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    // Mark messages as read
    await ChatService.markMessagesAsRead(conversationId);

    return NextResponse.json({
      success: true,
      message: 'Messages marked as read',
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);

    return NextResponse.json(
      {
        error: 'Failed to mark messages as read',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}