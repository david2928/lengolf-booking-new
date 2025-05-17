import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipStatusSessionUser extends NextAuthUser {
  id: string;
}

interface VipStatusSession extends NextAuthSession {
  accessToken?: string;
  user: VipStatusSessionUser;
}

export async function GET(request: NextRequest) {
  console.log(`[VIP Status API] GET request received for ${request.nextUrl.pathname}`);
  try {
    const session = await getServerSession(authOptions) as VipStatusSession | null;
    console.log('[VIP Status API] Session object:', session ? JSON.stringify(session, null, 2) : 'null');

    if (!session?.user?.id || !session.accessToken) {
      console.warn('[VIP Status API] Unauthorized: Missing session, user ID, or access token. Session details - User exists:', !!session?.user, 'User ID exists:', !!session?.user?.id, 'AccessToken exists:', !!session?.accessToken);
      return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
    }

    const profileId = session.user.id;
    const userAccessToken = session.accessToken; 

    console.log(`[VIP Status API] Profile ID: ${profileId}, AccessToken (first 10 chars): ${userAccessToken ? userAccessToken.substring(0, 10) : 'N/A'}...`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[VIP Status API] Supabase URL or Anon Key is not set.');
      return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userAccessToken}`
        }
      }
    });

    console.log('[VIP Status API] Attempting to fetch from crm_customer_mapping_vip_staging...');
    const { data: mapping, error } = await supabaseUserClient
      .from('crm_customer_mapping_vip_staging')
      .select('is_matched, crm_customer_id, stable_hash_id')
      .eq('profile_id', profileId)
      .single();

    if (error) {
      console.error('[VIP Status API] Error fetching crm_customer_mapping_vip_staging:', JSON.stringify(error, null, 2));
      if (error.code === 'PGRST116') { 
        console.log('[VIP Status API] Mapping not found for profileId:', profileId);
        return NextResponse.json({
          status: 'not_linked',
          crmCustomerId: null,
          stableHashId: null,
        });
      } else {
        return NextResponse.json({ error: 'Error fetching link status from database.', details: error.message, code: error.code }, { status: 500 });
      }
    }

    if (!mapping) {
      console.warn(`[VIP Status API] No mapping data found for profile ${profileId}, and no explicit DB error was PGRST116. Treating as not_linked.`);
      return NextResponse.json({
        status: 'not_linked',
        crmCustomerId: null,
        stableHashId: null,
      });
    }
    
    console.log('[VIP Status API] Mapping data found:', mapping);
    if (mapping.is_matched) {
      return NextResponse.json({
        status: 'linked_matched',
        crmCustomerId: mapping.crm_customer_id,
        stableHashId: mapping.stable_hash_id,
      });
    } else {
      return NextResponse.json({
        status: 'linked_unmatched',
        crmCustomerId: null, 
        stableHashId: mapping.stable_hash_id,
      });
    }

  } catch (e: any) {
    console.error('[VIP Status API] Unexpected error in GET handler:', e.message, 'Stack:', e.stack);
    return NextResponse.json({ error: 'Internal Server Error in VIP Status API', details: e.message }, { status: 500 });
  }
} 