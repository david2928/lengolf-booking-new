import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { matchProfileWithCrmV2, createProfileLink, getProfileCustomerLink, getRealTimeCustomerForProfile } from '@/utils/customer-matching';

interface LinkAccountSessionUser {
  id: string;
  name?: string | null; 
  email?: string | null;
}
interface LinkAccountSession {
  accessToken?: string;
  user: LinkAccountSessionUser;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions) as LinkAccountSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;

  let phoneNumber: string;

  try {
    const body = await request.json();
    phoneNumber = body.phoneNumber;

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: 'Phone number is required and must be a string.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    console.log(`[VIP Link Account API V2] Attempting to link profile ${profileId} with phone ${phoneNumber}`);

    // Check if profile already has a link
    const existingLink = await getProfileCustomerLink(profileId);
    if (existingLink) {
      console.log(`[VIP Link Account API V2] Profile ${profileId} already has a link to ${existingLink.stable_hash_id}`);
      
      // Verify the link is still valid by getting customer data
      const customerData = await getRealTimeCustomerForProfile(profileId);
      if (customerData) {
        return NextResponse.json({
          success: true,
          message: 'Your account is already linked to a customer record.',
          status: 'linked_matched',
          crmCustomerId: customerData.id,
          stableHashId: customerData.stable_hash_id,
          dataSource: 'simplified_v2'
        });
      } else {
        console.warn(`[VIP Link Account API V2] Existing link for ${profileId} points to invalid customer data`);
        // Continue with new matching attempt
      }
    }

    // Attempt CRM matching using V2 architecture
    const matchResult = await matchProfileWithCrmV2(profileId, {
      phoneNumberToMatch: phoneNumber,
      source: 'manual_link_vip_ui_phone_v2',
    });

    if (matchResult?.matched && matchResult.stableHashId && matchResult.crmCustomerId) {
      console.log(`[VIP Link Account API V2] Successfully matched profile ${profileId}:`, {
        crmCustomerId: matchResult.crmCustomerId,
        stableHashId: matchResult.stableHashId,
        confidence: matchResult.confidence
      });

      // Create the simplified profile link
      const linkCreated = await createProfileLink(
        profileId,
        matchResult.stableHashId,
        matchResult.confidence,
        'manual_link_vip_ui_phone_v2'
      );

      if (linkCreated) {
        return NextResponse.json({
          success: true,
          message: 'Excellent! Your account is now connected. You have full access to view your booking history, manage future bookings, view your lesson packages, and enjoy all VIP features.',
          status: 'linked_matched',
          crmCustomerId: matchResult.crmCustomerId,
          stableHashId: matchResult.stableHashId,
          dataSource: 'simplified_v2'
        });
      } else {
        console.error(`[VIP Link Account API V2] Failed to create profile link for ${profileId}`);
        return NextResponse.json({ error: 'Failed to create customer link.' }, { status: 500 });
      }

    } else {
      console.log(`[VIP Link Account API V2] No CRM match found for profile ${profileId} with phone ${phoneNumber}`);
      
      return NextResponse.json({
        error: 'No matching customer account found with that phone number. Please check the number and try again, or contact us if you believe this is an error.'
      }, { status: 404 });
    }

  } catch (error) {
    console.error('[VIP Link Account API V2] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 