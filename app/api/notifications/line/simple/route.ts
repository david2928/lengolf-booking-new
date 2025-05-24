import { NextRequest, NextResponse } from 'next/server';

// Prefer environment variables directly if configured, otherwise use from @/lib/env if it centralizes them
// For simplicity, assuming process.env directly here as seen in the other route.
// import { LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID } from '@/lib/env'; 

export async function POST(request: NextRequest) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  if (!channelAccessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not set');
    return NextResponse.json({ error: 'LINE API access token configuration error' }, { status: 500 });
  }
  if (!groupId) {
    console.error('LINE_GROUP_ID is not set');
    return NextResponse.json({ error: 'LINE group ID configuration error' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const message = body.message;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required and must be a string.' }, { status: 400 });
    }

    console.log('Sending simple LINE message to group:', {
      groupId,
      messageLength: message.length,
    });

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorDetails = errorBody;
      try {
        errorDetails = JSON.stringify(JSON.parse(errorBody), null, 2);
      } catch (e) {
        // If not JSON, use the raw text body
      }
      console.error(
        `[LINE Simple Notify] LINE API error sending message. Status: ${response.status}. Token: ${channelAccessToken ? 'SET (ends with ' + channelAccessToken.slice(-4) + ')' : 'NOT SET'}. GroupID: ${groupId}. Request Body: ${JSON.stringify({to: groupId, messages: [{type: 'text', text: message}]}, null, 2)}. Response Body: ${errorDetails}`
      );
      return NextResponse.json(
        { error: 'Failed to send simple LINE message', details: errorDetails },
        { status: response.status }
      );
    }
    const responseData = await response.json().catch(() => ({ message: 'LINE API response was not JSON or empty'}));

    console.log('[LINE Simple Notify] Simple LINE message sent successfully. Response:', responseData);
    return NextResponse.json({ success: true, responseData });

  } catch (error) {
    console.error('Error in simple LINE message handler:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal server error sending simple LINE message' },
      { status: 500 }
    );
  }
} 