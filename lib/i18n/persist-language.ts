import 'server-only';
import { createServerClient } from '@/utils/supabase/server';
import { isValidLocale, type Locale } from '@/i18n/routing';

type PersistArgs = {
  customerId: string;
  locale: string;
};

type PersistResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_locale' | 'db_error' };

export async function persistCustomerLanguage({
  customerId,
  locale,
}: PersistArgs): Promise<PersistResult> {
  if (!isValidLocale(locale)) {
    return { ok: false, reason: 'invalid_locale' };
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('customers')
    .update({ preferred_language: locale satisfies Locale })
    .eq('id', customerId);

  if (error) {
    console.error('[persistCustomerLanguage] DB error:', error);
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}
