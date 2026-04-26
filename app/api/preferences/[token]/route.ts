import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyCustomerToken } from '@/lib/marketing-prefs/token';

// Public, unauthenticated route — the token IS the auth.
// Always-fresh: never cache the customer's current consent state.
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ token: string }>;
}

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const customerId = verifyCustomerToken(token);
  if (!customerId) return notFound();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('customers')
    .select('customer_code, customer_name, email, marketing_opt_in')
    .eq('id', customerId)
    .maybeSingle();

  if (error || !data) return notFound();

  return NextResponse.json({
    customer_code: data.customer_code ?? null,
    name: data.customer_name ?? null,
    email: data.email ?? null,
    marketing_opt_in: !!data.marketing_opt_in,
  });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const customerId = verifyCustomerToken(token);
  if (!customerId) return notFound();

  // CSRF defense: refuse simple-request CORS posts (form-encoded, text/plain).
  // We only accept application/json; cross-origin browsers cannot send this
  // without a preflight, which Next.js will reject by default.
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  // Belt-and-suspenders: if Origin is sent, it must match our app origin.
  // Same-origin browser requests omit Origin or set it to NEXT_PUBLIC_APP_URL.
  // This blocks cross-site fetch calls even if a future config relaxes CORS.
  const origin = req.headers.get('origin');
  if (origin) {
    const expected = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
    if (expected && origin.replace(/\/+$/, '') !== expected) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const optIn = (body as { marketing_opt_in?: unknown })?.marketing_opt_in;
  if (typeof optIn !== 'boolean') {
    return NextResponse.json(
      { error: 'marketing_opt_in must be a boolean' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('customers')
    .update({
      marketing_opt_in: optIn,
      marketing_opt_in_changed_at: new Date().toISOString(),
      marketing_opt_in_source: 'preference_center',
    })
    .eq('id', customerId);

  if (error) {
    console.error('[preferences POST] Failed to update marketing_opt_in:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, marketing_opt_in: optIn });
}
