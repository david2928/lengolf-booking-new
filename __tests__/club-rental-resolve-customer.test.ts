import { resolveOrCreateCustomerId, resolveRentalCustomer } from '@/lib/club-rental/resolve-customer';

describe('resolveRentalCustomer — order header is canonical for course, line is the indoor fallback', () => {
  it('course rental prefers the order header customer', () => {
    const row = {
      customer_id: 'line-id',
      customer_name: 'Line Name',
      customer_phone: '0810000000',
      customer_email: 'line@example.com',
      order: {
        customer_id: 'order-id',
        customer_name: 'Order Name',
        customer_phone: '0899999999',
        customer_email: 'order@example.com',
      },
    };
    expect(resolveRentalCustomer(row)).toEqual({
      id: 'order-id',
      name: 'Order Name',
      phone: '0899999999',
      email: 'order@example.com',
    });
  });

  it('indoor rental (no order) falls back to the line', () => {
    const row = {
      customer_id: 'line-id',
      customer_name: 'Line Name',
      customer_phone: '0810000000',
      customer_email: 'line@example.com',
    };
    expect(resolveRentalCustomer(row)).toEqual({
      id: 'line-id',
      name: 'Line Name',
      phone: '0810000000',
      email: 'line@example.com',
    });
  });

  it('a null order embed falls back to the line', () => {
    const row = {
      customer_id: 'line-id',
      customer_name: 'Line Name',
      customer_phone: null,
      customer_email: null,
      order: null,
    };
    expect(resolveRentalCustomer(row)).toEqual({
      id: 'line-id',
      name: 'Line Name',
      phone: null,
      email: null,
    });
  });

  it('a null field on the order falls through to the line for that field only', () => {
    const row = {
      customer_id: 'line-id',
      customer_name: 'Line Name',
      customer_phone: '0810000000',
      customer_email: 'line@example.com',
      order: {
        customer_id: 'order-id',
        customer_name: 'Order Name',
        customer_phone: null,
        customer_email: null,
      },
    };
    expect(resolveRentalCustomer(row)).toEqual({
      id: 'order-id',
      name: 'Order Name',
      phone: '0810000000',
      email: 'line@example.com',
    });
  });

  it('everything missing resolves to all-null (no throw)', () => {
    expect(resolveRentalCustomer({})).toEqual({ id: null, name: null, phone: null, email: null });
  });
});

// ---------------------------------------------------------------------------
// resolveOrCreateCustomerId — guest checkout match-or-create (booking-new only)
// ---------------------------------------------------------------------------

interface MockAdminOpts {
  normalized?: string | null;
  matches?: Array<{ id: string; customer_code: string }>;
  matchError?: { message: string } | null;
  created?: { id: string; customer_code: string } | null;
  insertError?: { message: string } | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeAdmin(opts: MockAdminOpts) {
  const state: { insertedPayload?: any } = {};
  const admin = {
    rpc: jest.fn(async () => ({ data: opts.normalized ?? null })),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            limit: jest.fn(async () => ({
              data: opts.matches ?? [],
              error: opts.matchError ?? null,
            })),
          })),
        })),
      })),
      insert: jest.fn((payload: any) => {
        state.insertedPayload = payload;
        return {
          select: jest.fn(() => ({
            single: jest.fn(async () => ({
              data: opts.created ?? null,
              error: opts.insertError ?? null,
            })),
          })),
        };
      }),
    })),
  };
  return { admin, state };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('resolveOrCreateCustomerId — guest checkout links or creates a customer', () => {
  const guest = {
    customerPhone: '+819044692575',
    customerName: '高橋一郎',
    customerEmail: 'taro@example.jp',
    language: 'ja',
  };

  it('a caller-supplied customer_id wins without touching the DB', async () => {
    const { admin } = makeAdmin({});
    const id = await resolveOrCreateCustomerId(admin, { ...guest, customerId: 'trusted-id' });
    expect(id).toBe('trusted-id');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('no phone → null, never creates', async () => {
    const { admin, state } = makeAdmin({ normalized: '044692575' });
    expect(await resolveOrCreateCustomerId(admin, { ...guest, customerPhone: null })).toBeNull();
    expect(state.insertedPayload).toBeUndefined();
  });

  it('blank name → null, never creates (customers.customer_name is NOT NULL)', async () => {
    const { admin, state } = makeAdmin({ normalized: '044692575' });
    expect(await resolveOrCreateCustomerId(admin, { ...guest, customerName: '  ' })).toBeNull();
    expect(state.insertedPayload).toBeUndefined();
  });

  it('unusable phone (normalize → null) → null, never creates', async () => {
    const { admin, state } = makeAdmin({ normalized: null });
    expect(await resolveOrCreateCustomerId(admin, guest)).toBeNull();
    expect(state.insertedPayload).toBeUndefined();
  });

  it('exactly one active match links it without creating', async () => {
    const { admin, state } = makeAdmin({
      normalized: '044692575',
      matches: [{ id: 'existing-id', customer_code: 'CUS-042' }],
    });
    expect(await resolveOrCreateCustomerId(admin, guest)).toBe('existing-id');
    expect(state.insertedPayload).toBeUndefined();
  });

  it('ambiguous (>1) matches stay unlinked and never create', async () => {
    const { admin, state } = makeAdmin({
      normalized: '044692575',
      matches: [
        { id: 'a', customer_code: 'CUS-001' },
        { id: 'b', customer_code: 'CUS-002' },
      ],
    });
    expect(await resolveOrCreateCustomerId(admin, guest)).toBeNull();
    expect(state.insertedPayload).toBeUndefined();
  });

  it('zero matches creates the customer and returns the new id', async () => {
    const { admin, state } = makeAdmin({
      normalized: '044692575',
      matches: [],
      created: { id: 'new-id', customer_code: 'CUS-777' },
    });
    expect(await resolveOrCreateCustomerId(admin, guest)).toBe('new-id');
    expect(state.insertedPayload).toEqual({
      customer_name: '高橋一郎',
      contact_number: '+819044692575',
      email: 'taro@example.jp',
      preferred_language: 'ja',
    });
  });

  it('create without email/language stores nulls', async () => {
    const { admin, state } = makeAdmin({
      normalized: '812345678',
      matches: [],
      created: { id: 'new-id', customer_code: 'CUS-778' },
    });
    expect(
      await resolveOrCreateCustomerId(admin, {
        customerPhone: '0812345678',
        customerName: 'Somchai',
        customerEmail: null,
        language: null,
      }),
    ).toBe('new-id');
    expect(state.insertedPayload).toEqual({
      customer_name: 'Somchai',
      contact_number: '0812345678',
      email: null,
      preferred_language: null,
    });
  });

  it('a malformed email is dropped to null on create (CRM hygiene)', async () => {
    const { admin, state } = makeAdmin({
      normalized: '044692575',
      matches: [],
      created: { id: 'new-id', customer_code: 'CUS-779' },
    });
    expect(
      await resolveOrCreateCustomerId(admin, { ...guest, customerEmail: 'not-an-email' }),
    ).toBe('new-id');
    expect(state.insertedPayload.email).toBeNull();
  });

  it('a failed match lookup bails (never risks a duplicate create)', async () => {
    const { admin, state } = makeAdmin({
      normalized: '044692575',
      matchError: { message: 'boom' },
    });
    expect(await resolveOrCreateCustomerId(admin, guest)).toBeNull();
    expect(state.insertedPayload).toBeUndefined();
  });

  it('a failed insert degrades to null (order still goes through unlinked)', async () => {
    const { admin } = makeAdmin({
      normalized: '044692575',
      matches: [],
      created: null,
      insertError: { message: 'insert failed' },
    });
    expect(await resolveOrCreateCustomerId(admin, guest)).toBeNull();
  });
});
