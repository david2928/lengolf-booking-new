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

      try {
        if (account?.provider === 'guest') {
          if (!user.id) {
            console.error("[NextAuth Callback: signIn] Guest user object missing id. Cannot mint Supabase JWT.");
            return false;
          }
        } else {
          // For OAuth providers or any provider that's not 'guest'
          const { data: existingProfile } = await supabase
            .from('profiles_vip_staging')
            .select('id, display_name')
            .eq('provider_id', account?.providerAccountId) // Use providerAccountId for OAuth
            .eq('provider', account?.provider)
            .single();
          
          const userIdFromSupabase = existingProfile?.id || uuidv4(); // Use existing Supabase ID or generate new

          // Prepare data for upsert
          const profileDataToUpsert: any = {
            id: userIdFromSupabase, // This is the Supabase User ID
            email: user.email, // Email from provider
            picture_url: user.image, // Picture from provider
            provider: account?.provider,
            provider_id: account?.providerAccountId,
            updated_at: new Date().toISOString()
          };
          
          // Only update display_name if it's different or new
          if (!existingProfile || existingProfile.display_name !== user.name) {
             profileDataToUpsert.display_name = user.name; // Name from provider
          }

          const { error } = await supabase
            .from('profiles_vip_staging')
            .upsert(profileDataToUpsert, { 
              onConflict: 'id', // Upsert based on the Supabase user ID
              ignoreDuplicates: false // Ensure data is updated if it exists
            });

          if (error) {
            console.error('[NextAuth Callback: signIn] Failed to upsert profile:', error);
            return false; // Prevent sign-in if Supabase profile update fails
          }
          // Ensure the user object passed to the jwt callback has the correct Supabase ID
          user.id = userIdFromSupabase;
        }
        
        // Ensure provider is set on the user object for the jwt callback
        if(account?.provider) user.provider = account.provider;
        else if (!user.provider && user.id) { // For guest provider that might not have account object
          const { data: guestProfile } = await supabase.from('profiles_vip_staging').select('provider').eq('id', user.id).single();
          if (guestProfile?.provider) user.provider = guestProfile.provider;
        }

        // Attempt to create/refresh CRM mapping record
        if (user.id) {
          try {
            // Corrected call to getOrCreateCrmMapping
            await getOrCreateCrmMapping(user.id, { source: 'auth' });
          } catch (mappingError) {
            console.error('[NextAuth Callback: signIn] Error processing CRM mapping:', mappingError);
            // Decide if this should prevent sign-in, currently it doesn't
          }
        } else {
            console.warn("[NextAuth Callback: signIn] User ID not available for CRM mapping.");
        }

        return true; // Proceed with sign-in
      } catch (e) {
        console.error("[NextAuth Callback: signIn] Error in signIn callback:", e);
        return false; // Prevent sign-in on any other error
      }
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      if (token.sub && session.user) {
        session.user.id = token.sub; // Use 'sub' from token as user.id in session
      }
      if (token.provider && session.user) {
        (session.user as ExtendedUser).provider = token.provider as string;
      }
      if (token.supabaseAccessToken) {
        session.accessToken = token.supabaseAccessToken as string; // Pass Supabase token to session
      } else {
        console.warn("[NextAuth Callback: session] supabaseAccessToken is missing in token. Session will not have it.");
      }
      // Add any other properties from token to session as needed
      // session.user.role = token.role // Example if role is in token

      return session;
    },

    async jwt({ token, user, account, trigger, session: updateSession }: { 
      token: JWT; 
      user?: ExtendedUser; 
      account?: Account | null;
      trigger?: "signIn" | "signUp" | "update"; // `trigger` and `session` are for v4+
      session?: any; // Session data when `trigger` is "update"
    }) {
      if (user) {
      }
      if (account) {
      }

      // START OF NEW REFRESH LOGIC
      // Check if Supabase access token exists and is expiring soon or already expired
      if (token.supabaseAccessToken && typeof token.supabaseAccessToken === 'string') {
        try {
          const decodedSupabaseToken = jwt.decode(token.supabaseAccessToken) as { exp?: number; sub?: string, role?: string };
          // Ensure all necessary parts of the decoded token are present
          if (decodedSupabaseToken && typeof decodedSupabaseToken.exp === 'number' && typeof decodedSupabaseToken.sub === 'string') {
            const nowInSeconds = Math.floor(Date.now() / 1000);
            const fiveMinutesInSeconds = 5 * 60; // 5 minutes buffer

            if (decodedSupabaseToken.exp < (nowInSeconds + fiveMinutesInSeconds)) {
              console.log("[NextAuth Callback: jwt] Supabase access token is expiring or expired. Re-minting...");
              if (process.env.SUPABASE_JWT_SECRET) {
                const newPayload = {
                  sub: decodedSupabaseToken.sub,
                  role: decodedSupabaseToken.role || 'authenticated',
                  // Add any other consistent claims that were in the original token if necessary, e.g., aud, iss
                };
                const newSupabaseAccessToken = jwt.sign(
                  newPayload,
                  process.env.SUPABASE_JWT_SECRET,
                  { expiresIn: '1h' } // New 1-hour expiry
                );
                token.supabaseAccessToken = newSupabaseAccessToken;
                console.log("[NextAuth Callback: jwt] Supabase access token re-minted.");
              } else {
                console.error("[NextAuth Callback: jwt] Cannot re-mint Supabase token: Missing JWT secret.");
              }
            } else {
              // console.log("[NextAuth Callback: jwt] Supabase access token is still valid."); // Can be verbose
            }
          } else {
            console.warn("[NextAuth Callback: jwt] Could not decode Supabase token or essential claims (exp, sub) missing for refresh check.");
          }
        } catch (e) {
          console.error("[NextAuth Callback: jwt] Error decoding existing Supabase access token during refresh check:", e);
        }
      }
      // END OF NEW REFRESH LOGIC

      // This block runs on initial sign-in/link when `user` and `account` are present
      // It sets up the token with user details and the initial Supabase access token.
      if (account && user && user.id) { 
        token.sub = user.id; // `sub` claim should be the user's Supabase ID
        token.userId = user.id; 
        token.name = user.name;
        token.email = user.email; 
        token.picture = user.image;
        token.provider = account.provider || user.provider;

        // Mint Supabase JWT only if it's not already present (e.g. from refresh logic above)
        // or if we want to ensure it's freshly minted on any new account link/sign-in event.
        // The refresh logic above should handle subsequent calls.
        // This check ensures it's minted if it wasn't (e.g. very first sign-in).
        if (!token.supabaseAccessToken && process.env.SUPABASE_JWT_SECRET) {
          const payload = {
            sub: user.id, 
            role: 'authenticated', 
            // email: user.email, // Optional: include email if needed in JWT claims
            // user_metadata: { name: user.name, picture: user.image } // Optional
          };
          const supabaseAccessToken = jwt.sign(
            payload,
            process.env.SUPABASE_JWT_SECRET,
            { expiresIn: '1h' }
          );
          token.supabaseAccessToken = supabaseAccessToken;
          console.log("[NextAuth Callback: jwt] Supabase access token minted for new sign-in/account link for user:", user.id);
        } else if (!token.supabaseAccessToken && !process.env.SUPABASE_JWT_SECRET) { // Log error if secret missing and token not there
          console.error("[NextAuth Callback: jwt] SUPABASE_JWT_SECRET is not set. Cannot mint Supabase JWT for user:", user.id);
        }
        
        // Store LINE access token if available (this is different from Supabase token)
        if (account.provider === 'line' && account.access_token) {
          token.lineAccessToken = account.access_token;
          // Check if expires_at is in seconds and convert to milliseconds
          token.lineExpiresAt = account.expires_at ? (account.expires_at * 1000) : undefined; 
        }
      }
      
      // Handle session updates if `trigger` is "update" (NextAuth v4 feature)
      if (trigger === "update" && updateSession) {
        if (updateSession.name) token.name = updateSession.name;
        if (updateSession.picture) token.picture = updateSession.picture;
        // Add any other fields from `updateSession` that you want to be reflected in the JWT `token`
      }

      return token;
    }
  },
  // ... rest of the authOptions (secret, pages, etc.)
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/auth/login', // Default sign-in page
    // signOut: '/auth/signout',
    error: '/auth/error', // Error code passed in query string as ?error=
    // verifyRequest: '/auth/verify-request', // (used for email/passwordless login)
    // newUser: null // If you want to redirect new users to a specific page
  },
  session: {
    strategy: 'jwt', // Using JWT strategy
    // maxAge: 30 * 24 * 60 * 60, // 30 days for session JWT itself
    // updateAge: 24 * 60 * 60, // 24 hours to update session JWT
  },
  // debug: process.env.NODE_ENV === 'development', // Enable debug messages in development
};
