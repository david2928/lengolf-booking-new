import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { matchProfileWithCrm } from '@/utils/customer-matching';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
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
    const matchResult = await matchProfileWithCrm(profileId, {
      phoneNumberToMatch: phoneNumber,
      source: 'manual_link_vip_ui',
    });

    if (matchResult?.matched && matchResult.crmCustomerId) {
      return NextResponse.json({
        success: true,
        crmCustomerId: matchResult.crmCustomerId,
        stableHashId: matchResult.stableHashId,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'No matching customer account found.' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error during manual account linking:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 