import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'

async function getLineUserProfile(accessToken: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json();
  debug.log('LINE Profile Data:', data);
  return data;
}

async function getLineAccessToken(code: string, redirectUri: string) {
  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.NEXT_PUBLIC_LINE_CLIENT_ID!,
      client_secret: process.env.LINE_CLIENT_SECRET!,
    }),
  });
  const data = await response.json();
  debug.log('LINE Token Data:', data);
  return data;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const cookieStore = request.headers.get('cookie');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lengolf-booking-new-ej6pn7llcq-as.a.run.app';

  // Get the stored state from cookies
  const storedState = cookieStore?.split(';')
    .find(c => c.trim().startsWith('line_oauth_state='))
    ?.split('=')[1];

  if (error) {
    debug.error('LINE auth error:', error);
    return NextResponse.redirect(`${appUrl}/auth/login?error=line_login_failed`);
  }

  if (!code || !state || !storedState || state !== storedState) {
    debug.error('State validation failed:', { state, storedState });
    return NextResponse.redirect(`${appUrl}/auth/login?error=invalid_state`);
  }

  try {
    debug.log('Exchanging code for token...');
    const redirectUri = process.env.NEXT_PUBLIC_LINE_REDIRECT_URI || `${appUrl}/auth/callback/line`;
    const tokenData = await getLineAccessToken(code, redirectUri);
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token');
    }

    debug.log('Getting LINE profile...');
    const profile = await getLineUserProfile(tokenData.access_token);
    if (!profile.userId) {
      throw new Error('Failed to get LINE profile');
    }

    const supabase = await createClient();
    const email = `${profile.userId}@line.user`;

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: process.env.NEXT_PUBLIC_GUEST_PASSWORD!,
    });

    if (signInError?.status === 400) {
      // User doesn't exist, create new user
      debug.log('Creating new LINE user...');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: process.env.NEXT_PUBLIC_GUEST_PASSWORD!,
        options: {
          data: {
            name: profile.displayName,
            avatar_url: profile.pictureUrl,
            provider: 'line',
            line_id: profile.userId
          },
          emailRedirectTo: `${appUrl}/auth/callback/line`
        }
      });

      if (signUpError) {
        debug.error('Failed to create LINE user:', signUpError);
        throw signUpError;
      }

      // Update profile for new user
      if (signUpData?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: signUpData.user.id,
            line_id: profile.userId,
            display_name: profile.displayName,
            name: profile.displayName,
            picture_url: profile.pictureUrl,
            provider: 'line',
            updated_at: new Date().toISOString()
          });

        if (profileError) {
          debug.error('Failed to create profile:', profileError);
        }
      }
    } else if (signInData?.user) {
      // Update existing user's profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: signInData.user.id,
          line_id: profile.userId,
          display_name: profile.displayName,
          name: profile.displayName,
          picture_url: profile.pictureUrl,
          provider: 'line',
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        debug.error('Failed to update profile:', profileError);
      }
    }

    debug.log('LINE authentication successful');
    return NextResponse.redirect(`${appUrl}/bookings`);
  } catch (error) {
    debug.error('LINE login error:', error);
    return NextResponse.redirect(`${appUrl}/auth/login?error=line_login_failed`);
  }
} 