/**
 * Chat Initialize API Route
 * Initializes chat session and conversation
 * Following the pattern established in the VIP API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

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

    // Initialize session and conversation using service role to bypass RLS
    const serverSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create or get session - different logic for authenticated vs anonymous users
    let chatSession;

    if (userInfo?.userId) {
      // For authenticated users: upsert is safe as they own their session
      const { data: session, error: sessionError } = await serverSupabase
        .from('web_chat_sessions')
        .upsert({
          session_id: sessionId,
          user_id: userInfo.userId,
          customer_id: userInfo.customerId,
          display_name: userInfo.displayName,
          email: userInfo.email,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'session_id'
        })
        .select()
        .single();

      if (sessionError || !session) {
        throw new Error(`Failed to create session: ${sessionError?.message}`);
      }
      chatSession = session;
    } else {
      // For anonymous users: first try to find existing session
      const { data: existingSession } = await serverSupabase
        .from('web_chat_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .is('user_id', null) // Only match sessions without a user_id
        .maybeSingle();


      if (existingSession) {
        // Update last_seen_at for existing anonymous session
        const { data: updatedSession, error: updateError } = await serverSupabase
          .from('web_chat_sessions')
          .update({
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existingSession.id)
          .select()
          .single();

        if (updateError || !updatedSession) {
          throw new Error(`Failed to update session: ${updateError?.message}`);
        }
        chatSession = updatedSession;
      } else {
        // Create new anonymous session - if session_id conflicts with authenticated user, this will fail
        const { data: newSession, error: createError } = await serverSupabase
          .from('web_chat_sessions')
          .insert({
            session_id: sessionId,
            user_id: null,
            customer_id: null, // Anonymous users should never have customer_id
            display_name: null, // Anonymous users should never have display_name
            email: null, // Anonymous users should never have email
            last_seen_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError) {
          // If session_id already exists, provide more specific error
          if (createError.code === '23505') { // unique constraint violation
            throw new Error(`Session ID already exists: ${sessionId}. Error details: ${createError.message}`);
          }
          throw new Error(`Failed to create session: ${createError.message}`);
        }

        if (!newSession) {
          throw new Error('Failed to create session: No session returned');
        }
        chatSession = newSession;
      }
    }

    // Get or create conversation
    let conversation;

    if (userInfo?.userId) {
      // For authenticated users: find existing conversation
      const { data: existingConv } = await serverSupabase
        .from('web_chat_conversations')
        .select('*')
        .eq('user_id', userInfo.userId)
        .eq('is_active', true)
        .maybeSingle();

      if (existingConv) {
        // Update existing conversation - only update session_id, NOT last_message_at
        // last_message_at should only change when a message is actually sent
        const { data: updatedConv, error: updateError } = await serverSupabase
          .from('web_chat_conversations')
          .update({
            session_id: chatSession.id,
          })
          .eq('id', existingConv.id)
          .select()
          .single();

        if (updateError || !updatedConv) {
          throw new Error(`Failed to update conversation: ${updateError?.message}`);
        }
        conversation = updatedConv;
      } else {
        // Create new conversation for user
        const { data: newConv, error: convError } = await serverSupabase
          .from('web_chat_conversations')
          .insert({
            session_id: chatSession.id,
            user_id: userInfo.userId,
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
      // For anonymous users: find most recent conversation by session string
      const { data: existingConversations } = await serverSupabase
        .from('web_chat_conversations')
        .select('*, web_chat_sessions!inner(session_id)')
        .eq('web_chat_sessions.session_id', sessionId)
        .eq('is_active', true)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1);

      const existingConv = existingConversations?.[0] || null;

      if (existingConv) {
        conversation = existingConv;
      } else {
        // Create new conversation for anonymous user
        const { data: newConv, error: convError } = await serverSupabase
          .from('web_chat_conversations')
          .insert({
            session_id: chatSession.id,
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

    return NextResponse.json({
      success: true,
      session: chatSession,
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