/**
 * Chat Initialize API Route
 * Initializes chat session and conversation
 * Following the pattern established in the VIP API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatService } from '@/lib/chatService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, userInfo } = body;

    // Enhanced input validation
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Session ID is required and must be a string' },
        { status: 400 }
      );
    }

    if (sessionId.trim().length === 0 || sessionId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    // Get current session for authentication context
    const session = await getServerSession(authOptions);

    // Validate userInfo if provided
    if (userInfo) {
      if (typeof userInfo !== 'object' || Array.isArray(userInfo)) {
        return NextResponse.json(
          { error: 'User info must be an object' },
          { status: 400 }
        );
      }

      const { userId, displayName, email } = userInfo;

      // If user is authenticated, ensure userInfo matches session
      if (session?.user) {
        if (userId && userId !== session.user.id) {
          return NextResponse.json(
            { error: 'User ID mismatch with authenticated session' },
            { status: 403 }
          );
        }
        if (email && email !== session.user.email) {
          return NextResponse.json(
            { error: 'Email mismatch with authenticated session' },
            { status: 403 }
          );
        }
      }

      // Validate individual fields
      if (userId && (typeof userId !== 'string' || !userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))) {
        return NextResponse.json(
          { error: 'Invalid user ID format' },
          { status: 400 }
        );
      }

      if (displayName && (typeof displayName !== 'string' || displayName.length > 100)) {
        return NextResponse.json(
          { error: 'Invalid display name' },
          { status: 400 }
        );
      }

      if (email && (typeof email !== 'string' || !email.includes('@') || email.length > 254)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
    }

    // For authenticated users, ensure they can only create sessions for themselves
    if (session?.user?.id && sessionId !== `user_${session.user.id}`) {
      return NextResponse.json(
        { error: 'Authenticated users must use their own session ID format' },
        { status: 403 }
      );
    }

    // Initialize session and conversation
    const { session, conversation } = await ChatService.initializeSession(
      sessionId,
      userInfo
    );

    return NextResponse.json({
      success: true,
      session,
      conversation,
    });

  } catch (error) {
    console.error('Error initializing chat session:', error);

    return NextResponse.json(
      {
        error: 'Failed to initialize chat session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}