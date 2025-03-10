import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import LineProvider from 'next-auth/providers/line';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createServerClient } from '@/utils/supabase/server';
import { matchProfileWithCrm, type MatchResult, getOrCreateCrmMapping } from '@/utils/customer-matching';
import { syncPackagesForProfile } from '@/utils/supabase/crm-packages';
import { crmLogger } from '@/utils/logging';
import { v4 as uuidv4 } from 'uuid';
import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';
import type { User } from 'next-auth';
import type { Account } from 'next-auth';
import type { Profile as OAuthProfile } from 'next-auth';

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please provide process.env.NEXTAUTH_SECRET');
}

// Extend the User type to include our custom fields
interface ExtendedUser extends User {
  id: string;
  provider?: string;
  phone?: string | null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
          hl: "en"
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
          redirect_uri: process.env.NEXT_PUBLIC_LINE_REDIRECT_URI
        }
      },
      userinfo: {
        url: 'https://api.line.me/oauth2/v2.1/userinfo',
        params: { scope: 'profile openid email' }
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: null,
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
        
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', credentials.email)
          .eq('provider', 'guest')
          .single();

        if (existingProfile) {
          const { data: profile } = await supabase
            .from('profiles')
            .update({
              display_name: credentials.name,
              phone_number: credentials.phone,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingProfile.id)
            .select()
            .single();

          if (!profile) return null;

          return {
            id: existingProfile.id,
            name: credentials.name,
            email: credentials.email,
            phone: credentials.phone,
            provider: 'guest'
          };
        }

        const guestId = uuidv4();
        const { data: profile } = await supabase
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

        if (!profile) return null;

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
    async signIn({ user, account, profile: oauthProfile }: { 
      user: ExtendedUser; 
      account: Account | null; 
      profile?: OAuthProfile;
    }) {
      const requestId = crmLogger.newRequest();
      const supabase = createServerClient();

      try {
        if (account?.provider === 'guest') {
          return true;
        }

        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('provider_id', account?.providerAccountId)
          .single();

        const userId = existingProfile?.id || uuidv4();

        crmLogger.info(
          `User sign-in: ${account?.provider}`,
          { 
            email: user.email, 
            provider: account?.provider,
            isNewUser: !existingProfile
          },
          { 
            requestId,
            profileId: userId,
            source: 'auth'
          }
        );

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
          crmLogger.error(
            `Failed to upsert profile`,
            { error, userId },
            { requestId, profileId: userId, source: 'auth' }
          );
          return false;
        }

        user.id = userId;
        
        // Attempt to match the user with a CRM customer using the efficient method
        // This will first check for existing mapping before trying a new match
        crmLogger.info(
          `Starting CRM mapping lookup for sign-in`,
          { userId },
          { requestId, profileId: userId, source: 'auth' }
        );
        
        // Start the mapping process but don't await it
        // This allows the login to proceed regardless of mapping success
        getOrCreateCrmMapping(userId, {
          requestId,
          source: 'auth',
          timeoutMs: 5000, // Longer timeout for background process
          logger: crmLogger
        }).catch(error => {
          crmLogger.error(
            `Unexpected error in background CRM mapping`,
            { error, userId },
            { requestId, profileId: userId, source: 'auth' }
          );
        });

        return true;
      } catch (error) {
        crmLogger.error(
          `Sign-in process error`,
          { error },
          { requestId, source: 'auth' }
        );
        return false;
      }
    },
    async session({ session, token }: { session: Session; token: JWT }) {
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
          provider: token.provider as string,
          phone: profile?.phone_number || null
        },
        accessToken: token.accessToken
      };
    },
    async jwt({ token, user, account }: { token: JWT; user?: ExtendedUser; account?: Account | null }) {
      if (user) {
        token.id = user.id;
        token.provider = account?.provider;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
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
    maxAge: 30 * 24 * 60 * 60
  }
}; 