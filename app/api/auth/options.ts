import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import LineProvider from 'next-auth/providers/line';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createServerClient } from '@/utils/supabase/server';
import { matchProfileWithCrm } from '@/utils/customer-matching-service';
import { v4 as uuidv4 } from 'uuid';
import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please provide process.env.NEXTAUTH_SECRET');
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
      user: any; 
      account: any; 
      profile?: any;
    }) {
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

        if (error) return false;

        user.id = userId;
        
        // Attempt to match the user with a CRM customer record
        // This runs asynchronously and doesn't block the login process
        matchProfileWithCrm(userId).then(result => {
          if (result?.matched) {
            console.log(`User ${userId} automatically matched with CRM customer ${result.crmCustomerId} (confidence: ${result.confidence})`);
          }
        }).catch(err => {
          console.error(`Error matching user ${userId} with CRM:`, err);
        });
        
        return true;
      } catch (error) {
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
        }
      };
    },
    async jwt({ token, user, account }: { token: JWT; user: any; account: any }) {
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
    maxAge: 30 * 24 * 60 * 60
  }
}; 