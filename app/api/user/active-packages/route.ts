import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';
import { getPackageInfoForCustomer } from '@/utils/customer-service';

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

    const result = await getPackageInfoForCustomer(profile.customer_id, {
      excludeCategories: ['coaching'],
    });

    if (result.packageInfo === 'Normal Bay Rate') {
      return NextResponse.json({ hasPackage: false });
    }

    return NextResponse.json({
      hasPackage: true,
      packageDisplayName: result.packageTypeName ?? result.packageInfo,
    });
  } catch (error) {
    console.error('[active-packages] Error:', error);
    return NextResponse.json({ hasPackage: false });
  }
}
