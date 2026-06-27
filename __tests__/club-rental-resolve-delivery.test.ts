import { resolveRentalDelivery } from '@/lib/club-rental/resolve-delivery';

describe('resolveRentalDelivery — order header is canonical for course, line is the indoor fallback', () => {
  it('course rental prefers the order header delivery', () => {
    const row = {
      delivery_requested: false,
      delivery_address: 'Line Addr',
      delivery_time: '10:00',
      return_time: '18:00',
      return_pickup_address: 'Line Pickup',
      order: {
        delivery_requested: true,
        delivery_address: 'Order Addr',
        delivery_time: '11:00',
        return_time: '19:00',
        return_pickup_address: 'Order Pickup',
      },
    };
    expect(resolveRentalDelivery(row)).toEqual({
      requested: true,
      address: 'Order Addr',
      deliveryTime: '11:00',
      returnTime: '19:00',
      returnPickupAddress: 'Order Pickup',
    });
  });

  it('indoor rental (no order) falls back to the line', () => {
    const row = {
      delivery_requested: true,
      delivery_address: 'Line Addr',
      delivery_time: '10:00',
      return_time: '18:00',
      return_pickup_address: null,
    };
    expect(resolveRentalDelivery(row)).toEqual({
      requested: true,
      address: 'Line Addr',
      deliveryTime: '10:00',
      returnTime: '18:00',
      returnPickupAddress: null,
    });
  });

  it('a null order embed falls back to the line', () => {
    const row = {
      delivery_requested: true,
      delivery_address: 'Line Addr',
      delivery_time: null,
      return_time: null,
      return_pickup_address: null,
      order: null,
    };
    expect(resolveRentalDelivery(row)).toEqual({
      requested: true,
      address: 'Line Addr',
      deliveryTime: null,
      returnTime: null,
      returnPickupAddress: null,
    });
  });

  it('a null field on the order falls through to the line for that field only', () => {
    const row = {
      delivery_requested: true,
      delivery_address: 'Line Addr',
      delivery_time: '10:00',
      return_time: '18:00',
      return_pickup_address: 'Line Pickup',
      order: {
        delivery_requested: true,
        delivery_address: 'Order Addr',
        delivery_time: null,
        return_time: null,
        return_pickup_address: null,
      },
    };
    expect(resolveRentalDelivery(row)).toEqual({
      requested: true,
      address: 'Order Addr',
      deliveryTime: '10:00',
      returnTime: '18:00',
      returnPickupAddress: 'Line Pickup',
    });
  });

  it('requested defaults to false when both order and line are nullish', () => {
    expect(resolveRentalDelivery({})).toEqual({
      requested: false,
      address: null,
      deliveryTime: null,
      returnTime: null,
      returnPickupAddress: null,
    });
  });
});
