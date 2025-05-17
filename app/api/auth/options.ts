import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import LineProvider from 'next-auth/providers/line';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createClient } from '@supabase/supabase-js';
import { getOrCreateCrmMapping } from '@/utils/customer-matching';
import { v4 as uuidv4 } from 'uuid';
import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';
import type { User } from 'next-auth';
import type { Account } from 'next-auth';
import type { Profile as OAuthProfile } from 'next-auth';
import jwt from 'jsonwebtoken'; // For minting Supabase JWT

console.log(`[Auth Options] Current NODE_ENV: ${process.env.NODE_ENV}`);

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please provide process.env.NEXTAUTH_SECRET');
}

// Create a dedicated Supabase client instance for admin operations within auth options
// This client will use the Service Role Key.
const supabaseAdminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // CRITICAL: Use the Service Role Key
  {
    auth: {
      // Recommended to ensure service role client doesn't accidentally use user sessions
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

// Extend the User type to include our custom fields
interface ExtendedUser extends User {
  id: string;
  provider?: string;
  phone?: string | null;
}

export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" 
            ? `__Secure-next-auth.session-token` 
            : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
        // Domain can be omitted to default to the current host,
        // or set explicitly if needed for subdomains in production
        // domain: process.env.NODE_ENV === "production" ? ".yourdomain.com" : "localhost",
      },
    },
    // You can add configurations for other cookies like csrfToken, pkceCode if needed
    // For example, for CSRF token if you face issues with it:
    // csrfToken: {
    //   name: process.env.NODE_ENV === "production" 
    //         ? `__Host-next-auth.csrf-token` 
    //         : `next-auth.csrf-token`,
    //   options: {
    //     httpOnly: true,
    //     sameSite: "none", // Adjust if necessary, often 'lax' is fine for CSRF
    //     path: "/",
    //     secure: process.env.NODE_ENV === "production",
    //   },
    // },
  },
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

        const supabase = supabaseAdminClient;
        
        const { data: existingProfile } = await supabase
          .from('profiles_vip_staging')
          .select('*')
          .eq('email', credentials.email)
          .eq('provider', 'guest')
          .single();

        if (existingProfile) {
          const { data: profile } = await supabase
            .from('profiles_vip_staging')
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
          .from('profiles_vip_staging')
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
      const supabase = supabaseAdminClient;
      console.log("[NextAuth Callback: signIn] User:", JSON.stringify(user, null, 2));
      console.log("[NextAuth Callback: signIn] Account:", JSON.stringify(account, null, 2));

      try {
        if (account?.provider === 'guest') {
          console.log("[NextAuth Callback: signIn] Guest user, proceeding.");
          if (!user.id) {
            console.error("[NextAuth Callback: signIn] Guest user object missing id. Cannot mint Supabase JWT.");
            return false;
          }
        } else {
          const { data: existingProfile } = await supabase
            .from('profiles_vip_staging')
            .select('id, display_name')
            .eq('provider_id', account?.providerAccountId)
            .eq('provider', account?.provider)
            .single();
          
          console.log("[NextAuth Callback: signIn] Existing Profile:", JSON.stringify(existingProfile, null, 2));

          const userIdFromSupabase = existingProfile?.id || uuidv4();
          console.log("[NextAuth Callback: signIn] Determined Supabase userId:", userIdFromSupabase);

          const profileDataToUpsert: any = {
            id: userIdFromSupabase,
            email: user.email,
            picture_url: user.image,
            provider: account?.provider,
            provider_id: account?.providerAccountId,
            updated_at: new Date().toISOString()
          };

          if (!existingProfile || existingProfile.display_name !== user.name) {
             profileDataToUpsert.display_name = user.name;
          }

          const { error } = await supabase
            .from('profiles_vip_staging')
            .upsert(profileDataToUpsert, { 
              onConflict: 'id',
              ignoreDuplicates: false
            });

          if (error) {
            console.error('[NextAuth Callback: signIn] Failed to upsert profile:', error);
            return false;
          }
          console.log("[NextAuth Callback: signIn] Profile upserted successfully for userId:", userIdFromSupabase);
          user.id = userIdFromSupabase;
        }
        
        if(account?.provider) user.provider = account.provider;
        else if (!user.provider && user.id) {
          const { data: guestProfile } = await supabase.from('profiles_vip_staging').select('provider').eq('id', user.id).single();
          if (guestProfile?.provider) user.provider = guestProfile.provider;
        }

        if (process.env.SUPABASE_JWT_SECRET && user.id) {
          const supabaseJwtPayload = {
            sub: user.id,
            role: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + (60 * 60),
          };
          try {
            const supabaseToken = jwt.sign(supabaseJwtPayload, process.env.SUPABASE_JWT_SECRET);
            (user as any).supabaseAccessToken = supabaseToken;
            console.log("[NextAuth Callback: signIn] Minted Supabase JWT for user:", user.id);
          } catch (jwtError) {
            console.error("[NextAuth Callback: signIn] Error minting Supabase JWT:", jwtError);
          }
        } else {
          console.warn("[NextAuth Callback: signIn] SUPABASE_JWT_SECRET not set or user.id missing. Cannot mint Supabase JWT.");
        }
        
        console.log("[NextAuth Callback: signIn] Attempting background CRM mapping for userId:", user.id);
        getOrCreateCrmMapping(user.id, { source: 'auth' }).catch(crmError => {
          console.error('[NextAuth Callback: signIn] Unexpected error in background CRM mapping:', crmError);
        });

        console.log("[NextAuth Callback: signIn] Completed successfully for user.id:", user.id);
        return true;
      } catch (error) {
        console.error('[NextAuth Callback: signIn] Sign-in process error:', error);
        return false;
      }
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      console.log("[NextAuth Callback: session] Original session:", JSON.stringify(session, null, 2));
      console.log("[NextAuth Callback: session] Token received:", JSON.stringify(token, null, 2));

      if (token && token.sub) {
        session.user.id = token.sub;
        if (token.provider) {
          (session.user as ExtendedUser).provider = token.provider as string;
        }
        
        if ((token as any).supabaseAccessToken) {
            (session as any).accessToken = (token as any).supabaseAccessToken as string;
            console.log("[NextAuth Callback: session] Using supabaseAccessToken for session.accessToken");
        } else {
            (session as any).accessToken = null; 
            console.warn("[NextAuth Callback: session] supabaseAccessToken not found in token. session.accessToken set to null.");
        }
      } else {
        console.warn("[NextAuth Callback: session] Token or token.sub is missing.");
        (session as any).accessToken = null;
      }
      
      console.log("[NextAuth Callback: session] Modified session:", JSON.stringify(session, null, 2));
      return session;
    },
    async jwt({ token, user, account }: { token: JWT; user?: ExtendedUser; account?: Account | null }) {
      console.log("[NextAuth Callback: jwt] Initial token:", JSON.stringify(token, null, 2));
      if (user) {
        console.log("[NextAuth Callback: jwt] User object present:", JSON.stringify(user, null, 2));
        token.sub = user.id;
        if (user.provider) {
          token.provider = user.provider;
        }
        if ((user as any).supabaseAccessToken) {
          (token as any).supabaseAccessToken = (user as any).supabaseAccessToken;
          console.log("[NextAuth Callback: jwt] Transferred supabaseAccessToken from user to token.");
        }
      }

      if (!(token as any).supabaseAccessToken && token.sub && process.env.SUPABASE_JWT_SECRET) {
        console.log(`[NextAuth Callback: jwt] supabaseAccessToken missing in token. Attempting to re-mint for user ID: ${token.sub}`);
        const supabaseJwtPayload = {
          sub: token.sub,
          role: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + (60 * 60),
        };
        try {
          const newSupabaseToken = jwt.sign(supabaseJwtPayload, process.env.SUPABASE_JWT_SECRET);
          (token as any).supabaseAccessToken = newSupabaseToken;
          console.log("[NextAuth Callback: jwt] Re-minted and added supabaseAccessToken to token.");
        } catch (jwtError) {
          console.error("[NextAuth Callback: jwt] Error re-minting Supabase JWT:", jwtError);
        }
      } else if (!(token as any).supabaseAccessToken && token.sub && !process.env.SUPABASE_JWT_SECRET) {
          console.warn("[NextAuth Callback: jwt] SUPABASE_JWT_SECRET not set. Cannot re-mint Supabase JWT.");
      }

      console.log("[NextAuth Callback: jwt] Final supabaseAccessToken status:", (token as any).supabaseAccessToken ? 'Present' : 'Missing');
      console.log("[NextAuth Callback: jwt] Final full token:", JSON.stringify(token, null, 2));
      return token;
    }
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 0, // Disable activity-based session extension
  },
  debug: false,
}; 