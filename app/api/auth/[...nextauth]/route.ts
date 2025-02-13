import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import LineProvider from 'next-auth/providers/line';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createServerClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please provide process.env.NEXTAUTH_SECRET');
}

// Debug logging for LINE configuration
console.log('LINE OAuth Configuration:', {
  clientId: process.env.NEXT_PUBLIC_LINE_CLIENT_ID,
  redirectUri: process.env.NEXT_PUBLIC_LINE_REDIRECT_URI
});

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
          hl: "en"  // Force English language
        }
      }
    }),
    FacebookProvider({
      clientId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
      clientSecret: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_SECRET!
    }),
    LineProvider({
      clientId: process.env.NEXT_PUBLIC_LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
      authorization: {
        url: 'https://access.line.me/oauth2/v2.1/authorize',
        params: {
          scope: 'profile openid email',
          bot_prompt: 'normal',
          client_id: process.env.NEXT_PUBLIC_LINE_CLIENT_ID,
          redirect_uri: process.env.NEXT_PUBLIC_LINE_REDIRECT_URI
        }
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: null, // Don't set any email initially
          image: profile.picture
        }
      }
    }),
    CredentialsProvider({
      id: 'guest',
      name: 'Guest',
      credentials: {
        name: { label: 'Name', type: 'text' },
        email: { label: 'Email', type: 'email' },
        phone: { label: 'Phone', type: 'tel' }
      },
      async authorize(credentials) {
        if (!credentials?.name || !credentials?.email || !credentials?.phone) {
          return null;
        }

        const supabase = createServerClient();
        
        // Check if profile exists with this email
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', credentials.email)
          .eq('provider', 'guest')
          .single();

        if (existingProfile) {
          // Update existing profile
          const { data: profile, error: updateError } = await supabase
            .from('profiles')
            .update({
              display_name: credentials.name,
              phone_number: credentials.phone,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingProfile.id)
            .select()
            .single();

          if (updateError) {
            console.error('Failed to update profile:', updateError);
            return null;
          }

          return {
            id: existingProfile.id,
            name: credentials.name,
            email: credentials.email,
            phone: credentials.phone,
            provider: 'guest'
          };
        }

        // Create new profile if none exists
        const guestId = uuidv4();
        const { data: profile, error } = await supabase
          .from('profiles')
          .insert({
            id: guestId,
            email: credentials.email,
            display_name: credentials.name,
            phone_number: credentials.phone,
            provider: 'guest',
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('Failed to create profile:', error);
          return null;
        }

        return {
          id: guestId,
          name: credentials.name,
          email: credentials.email,
          phone: credentials.phone,
          provider: 'guest'
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile: oauthProfile }) {
      const supabase = createServerClient();

      try {
        // For guest users, we already created the profile in authorize
        if (account?.provider === 'guest') {
          return true;
        }

        // For OAuth providers, check if profile exists by provider_id
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('provider_id', account?.providerAccountId)
          .single();

        const userId = existingProfile?.id || uuidv4();

        // Create/update profile
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: user.email,
            display_name: user.name,
            picture_url: user.image,
            provider: account?.provider,
            provider_id: account?.providerAccountId,
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.error('Failed to update profile:', error);
          return false;
        }

        user.id = userId;
        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
    async session({ session, token }) {
      // Get the user profile to include phone number
      const supabase = createServerClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', token.sub)
        .single();

      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          provider: token.provider,
          phone: profile?.phone_number || null
        }
      };
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.provider = account?.provider;
      }
      return token;
    }
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  debug: process.env.NODE_ENV === 'development'
});

export { handler as GET, handler as POST }; 