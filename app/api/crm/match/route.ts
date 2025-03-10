import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { matchProfileWithCrm } from '@/utils/customer-matching';
import { crmLogger } from '@/utils/logging';

/**
 * Get the CRM customer mapped to a profile
 */
export async function GET(request: NextRequest) {
  const requestId = crmLogger.newRequest();
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      crmLogger.warn(
        'Unauthorized CRM mapping request',
        { headers: Object.fromEntries(request.headers) },
        { requestId, source: 'crm-match-api' }
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      crmLogger.warn(
        'Missing profile ID in CRM mapping request',
        { userId: session.user.id },
        { requestId, profileId: session.user.id, source: 'crm-match-api' }
      );
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Users can only access their own mapping
    if (session.user.id !== profileId) {
      crmLogger.warn(
        'Unauthorized access attempt to another user\'s CRM mapping',
        { 
          requestedProfileId: profileId,
          requestingUserId: session.user.id 
        },
        { requestId, profileId: session.user.id, source: 'crm-match-api' }
      );
      return NextResponse.json({ error: 'You can only access your own mapping' }, { status: 403 });
    }

    crmLogger.info(
      'CRM mapping request',
      { profileId },
      { requestId, profileId, source: 'crm-match-api' }
    );

    const supabase = createServerClient();
    const { data: mapping, error } = await supabase
      .from('crm_customer_mapping')
      .select('crm_customer_id, crm_customer_data')
      .eq('profile_id', profileId)
      .eq('is_matched', true)
      .maybeSingle();
      
    if (error) {
      crmLogger.error(
        'Error retrieving CRM mapping',
        { error, profileId },
        { requestId, profileId, source: 'crm-match-api' }
      );
    } else {
      crmLogger.info(
        mapping ? 'CRM mapping found' : 'No CRM mapping found',
        { 
          profileId,
          hasCrmMapping: !!mapping,
          crmCustomerId: mapping?.crm_customer_id
        },
        { 
          requestId, 
          profileId, 
          crmCustomerId: mapping?.crm_customer_id,
          source: 'crm-match-api' 
        }
      );
    }

    return NextResponse.json({
      success: true,
      mapping: mapping || null
    });
  } catch (error) {
    crmLogger.error(
      'Exception in CRM mapping request',
      { error },
      { requestId, source: 'crm-match-api' }
    );
    return NextResponse.json({ error: 'Failed to get CRM mapping' }, { status: 500 });
  }
}

/**
 * Force a new matching attempt for a profile
 */
export async function POST(request: NextRequest) {
  const requestId = crmLogger.newRequest();
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      crmLogger.warn(
        'Unauthorized CRM matching request',
        { headers: Object.fromEntries(request.headers) },
        { requestId, source: 'crm-match-api' }
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileId } = await request.json();
    if (!profileId) {
      crmLogger.warn(
        'Missing profile ID in CRM matching request',
        { userId: session.user.id },
        { requestId, profileId: session.user.id, source: 'crm-match-api' }
      );
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Users can only match their own profile
    if (session.user.id !== profileId) {
      crmLogger.warn(
        'Unauthorized access attempt to match another user\'s profile',
        { 
          requestedProfileId: profileId,
          requestingUserId: session.user.id 
        },
        { requestId, profileId: session.user.id, source: 'crm-match-api' }
      );
      return NextResponse.json({ error: 'You can only match your own profile' }, { status: 403 });
    }

    crmLogger.info(
      'Manual CRM matching attempt',
      { profileId },
      { requestId, profileId, source: 'crm-match-api' }
    );

    const result = await matchProfileWithCrm(profileId);
    
    crmLogger.info(
      result?.matched ? 'CRM matching successful' : 'CRM matching unsuccessful',
      { 
        profileId,
        matched: result?.matched || false,
        confidence: result?.confidence || 0,
        reasons: result?.reasons || [],
        crmCustomerId: result?.crmCustomerId || null
      },
      { 
        requestId, 
        profileId, 
        crmCustomerId: result?.crmCustomerId || null,
        source: 'crm-match-api' 
      }
    );
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    crmLogger.error(
      'Exception in CRM matching request',
      { error },
      { requestId, source: 'crm-match-api' }
    );
    return NextResponse.json({ error: 'Failed to match profile' }, { status: 500 });
  }
} 