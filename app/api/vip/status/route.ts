import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import { getRealTimeCustomerForProfile, getProfileCustomerLink, getOrCreateCrmMappingV2 } from '@/utils/customer-matching';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipStatusSessionUser extends NextAuthUser {
  id: string;
}

interface VipStatusSession extends NextAuthSession {
  accessToken?: string;
  user: VipStatusSessionUser;
}

// Helper to create admin client
const getSupabaseAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions) as VipStatusSession | null;

    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
    }

    const profileId = session.user.id;

    console.log(`[VIP Status API V2] Checking status for profile ${profileId}`);

    // NEW: Use simplified architecture - check for existing profile link
    const profileLink = await getProfileCustomerLink(profileId);
    
    if (profileLink) {
      console.log(`[VIP Status API V2] Found profile link:`, {
        stableHashId: profileLink.stable_hash_id,
        confidence: profileLink.match_confidence,
        method: profileLink.match_method
      });
      
      // Get real-time customer data to verify the link is still valid
      const customerData = await getRealTimeCustomerForProfile(profileId);
      
      if (customerData) {
        return NextResponse.json({
          status: 'linked_matched',
          crmCustomerId: customerData.id,
          stableHashId: customerData.stable_hash_id,
          dataSource: 'simplified_v2'
        });
      } else {
        // Link exists but customer data not found - possibly stale link
        console.warn(`[VIP Status API V2] Profile link exists but no customer data found for ${profileId}`);
        return NextResponse.json({
          status: 'linked_unmatched',
          crmCustomerId: null,
          stableHashId: profileLink.stable_hash_id,
          dataSource: 'simplified_v2'
        });
      }
    }

    console.log(`[VIP Status API V2] No profile link found for ${profileId}, attempting automatic matching`);

    // NEW: Attempt automatic matching using V2 architecture
    try {
      const mappingResult = await getOrCreateCrmMappingV2(profileId, {
        source: 'vip_status_auto_match',
        timeoutMs: 3000 // Shorter timeout for API response
      });

      if (mappingResult) {
        console.log(`[VIP Status API V2] Successfully created/found mapping:`, {
          crmCustomerId: mappingResult.crmCustomerId,
          stableHashId: mappingResult.stableHashId,
          confidence: mappingResult.confidence,
          isNewMatch: mappingResult.isNewMatch
        });

        return NextResponse.json({
          status: 'linked_matched',
          crmCustomerId: mappingResult.crmCustomerId,
          stableHashId: mappingResult.stableHashId,
          dataSource: 'simplified_v2'
        });
      } else {
        console.log(`[VIP Status API V2] No CRM match could be established for ${profileId}`);
        
        return NextResponse.json({
          status: 'not_linked',
          crmCustomerId: null,
          stableHashId: null,
          dataSource: 'simplified_v2'
        });
      }
    } catch (error) {
      console.error(`[VIP Status API V2] Error during automatic matching:`, error);
      
      // Fall back to not_linked status
      return NextResponse.json({
        status: 'not_linked',
        crmCustomerId: null,
        stableHashId: null,
        dataSource: 'simplified_v2'
      });
    }

  } catch (error) {
    console.error('[VIP Status API V2] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 