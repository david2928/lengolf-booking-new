import { resolveRentalCustomer } from '@/lib/club-rental/resolve-customer';

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
