import { persistCustomerLanguage } from '@/lib/i18n/persist-language';
import { createServerClient } from '@/utils/supabase/server';

jest.mock('@/utils/supabase/server');

const mockedCreateServerClient = createServerClient as jest.MockedFunction<
  typeof createServerClient
>;

describe('persistCustomerLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid locale', async () => {
    const result = await persistCustomerLanguage({
      customerId: 'cust-1',
      locale: 'xx',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_locale' });
  });

  it('writes the locale to customers.preferred_language', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    mockedCreateServerClient.mockReturnValue({ from } as any);

    const result = await persistCustomerLanguage({
      customerId: 'cust-1',
      locale: 'th',
    });

    expect(from).toHaveBeenCalledWith('customers');
    expect(update).toHaveBeenCalledWith({ preferred_language: 'th' });
    expect(eq).toHaveBeenCalledWith('id', 'cust-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns db_error when supabase errors', async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: 'oops' } });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    mockedCreateServerClient.mockReturnValue({ from } as any);

    const result = await persistCustomerLanguage({
      customerId: 'cust-1',
      locale: 'en',
    });

    expect(result).toEqual({ ok: false, reason: 'db_error' });
  });
});
