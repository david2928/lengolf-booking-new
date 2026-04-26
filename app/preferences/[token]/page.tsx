import { notFound } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyCustomerToken } from '@/lib/marketing-prefs/token';
import PreferencesForm from './PreferencesForm';

// Public, unauthenticated page rendered outside the [locale] segment.
// English-only by design (see plan).
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ unsubscribe?: string }>;
}

export default async function PreferencesPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const customerId = verifyCustomerToken(token);
  if (!customerId) notFound();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('customers')
    .select('customer_code, customer_name, email, marketing_opt_in')
    .eq('id', customerId)
    .maybeSingle();

  if (error || !data) notFound();

  const customer = data as {
    customer_code: string | null;
    customer_name: string | null;
    email: string | null;
    marketing_opt_in: boolean | null;
  };

  const unsubscribePrompt = sp.unsubscribe === '1';

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}
    >
      {/* Header band */}
      <header
        className="text-white py-6 px-4 sm:py-8"
        style={{ backgroundColor: '#005a32' }}
      >
        <div className="max-w-xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] opacity-75">LENGOLF</p>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-1">Email Preferences</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 sm:py-8">
        {/* Customer identity card */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Account
          </h2>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {customer.customer_name ?? 'LENGOLF customer'}
          </p>
          {customer.email && (
            <p className="text-sm text-gray-600 mt-0.5 break-all">{customer.email}</p>
          )}
          {customer.customer_code && (
            <p className="text-xs text-gray-400 mt-1">Customer ID: {customer.customer_code}</p>
          )}
        </section>

        {/* Form */}
        <PreferencesForm
          token={token}
          initialOptIn={!!customer.marketing_opt_in}
          unsubscribePrompt={unsubscribePrompt}
        />

        {/* Footer */}
        <p className="text-xs text-gray-500 text-center mt-8 leading-relaxed">
          You&apos;re receiving this page because you&apos;re a LENGOLF customer.{' '}
          <a
            href="https://www.len.golf/privacy-policy/"
            className="underline hover:text-gray-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
        </p>
      </main>
    </div>
  );
}
