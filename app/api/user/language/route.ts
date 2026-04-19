import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import { persistCustomerLanguage } from '@/lib/i18n/persist-language';
import { isValidLocale } from '@/i18n/routing';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { locale?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const locale = typeof body.locale === 'string' ? body.locale : '';
    if (!isValidLocale(locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    const profileId = session.user.id;
    const supabase = createServerClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', profileId)
      .maybeSingle();

    if (profileError) {
      console.error('[user/language API] Profile lookup error:', profileError);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    if (!profile?.customer_id) {
      // No CRM mapping yet — cookie-only persistence (done on the client) is still fine.
      return NextResponse.json({ ok: true, persisted: false });
    }

    const result = await persistCustomerLanguage({
      customerId: profile.customer_id,
      locale,
    });
    if (!result.ok) {
      const status = result.reason === 'invalid_locale' ? 400 : 500;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    console.error('[user/language API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
