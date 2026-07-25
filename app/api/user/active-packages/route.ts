import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActivePackageDetailsForCustomer } from '@/utils/customer-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ hasPackage: false });
    }

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', session.user.id)
      .single();

    if (!profile?.customer_id) {
      return NextResponse.json({ hasPackage: false });
    }

    const result = await getActivePackageDetailsForCustomer(profile.customer_id, {
      excludeCategories: ['coaching'],
    });

    if (result.packageInfo === 'Normal Bay Rate') {
      return NextResponse.json({ hasPackage: false });
    }

    // `hasPackage` and `packageDisplayName` keep their exact previous shapes:
    // `hasPackage` gates the 4 h / 5 h duration rungs and
    // `packageDisplayName` feeds the cost calculator's Early Bird detection.
    // The balance fields are additive and describe the SAME package.
    return NextResponse.json({
      hasPackage: true,
      packageDisplayName: result.packageTypeName ?? result.packageInfo,
      remainingHours: result.remainingHours,
      totalHours: result.totalHours,
      usedHours: result.usedHours,
      expiryDate: result.expiryDate,
      isUnlimited: result.isUnlimited,
    });
  } catch (error) {
    console.error('[active-packages] Error:', error);
    return NextResponse.json({ hasPackage: false });
  }
}
