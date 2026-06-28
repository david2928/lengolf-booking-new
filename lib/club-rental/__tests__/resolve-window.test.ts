import { resolveRentalWindow } from '../resolve-window'

describe('resolveRentalWindow — order header is canonical for course, line is the indoor fallback', () => {
  it('course rental prefers the order header window', () => {
    const row = {
      start_date: '2026-01-01', end_date: '2026-01-01', start_time: '09:00:00',
      return_time: '17:00', duration_days: 1,
      order: {
        start_date: '2026-02-02', end_date: '2026-02-05', start_time: '10:00:00',
        return_time: '18:00', duration_days: 3,
      },
    }
    expect(resolveRentalWindow(row)).toEqual({
      startDate: '2026-02-02', endDate: '2026-02-05', startTime: '10:00:00',
      returnTime: '18:00', durationDays: 3,
    })
  })

  it('indoor rental (no order embed) falls back to the line', () => {
    const row = {
      start_date: '2026-01-01', end_date: '2026-01-01', start_time: '09:00:00',
      return_time: null, duration_days: 1,
    }
    expect(resolveRentalWindow(row)).toEqual({
      startDate: '2026-01-01', endDate: '2026-01-01', startTime: '09:00:00',
      returnTime: null, durationDays: 1,
    })
  })

  it('a null order embed falls back to the line', () => {
    const row = {
      start_date: '2026-01-01', end_date: '2026-01-02', start_time: null,
      return_time: null, duration_days: 1, order: null,
    }
    expect(resolveRentalWindow(row)).toEqual({
      startDate: '2026-01-01', endDate: '2026-01-02', startTime: null,
      returnTime: null, durationDays: 1,
    })
  })

  it('a null field on the order falls through to the line for that field only', () => {
    const row = {
      start_date: '2026-01-01', end_date: '2026-01-01', start_time: '09:00:00',
      return_time: '17:00', duration_days: 1,
      order: {
        start_date: '2026-02-02', end_date: '2026-02-02', start_time: null,
        return_time: null, duration_days: null,
      },
    }
    expect(resolveRentalWindow(row)).toEqual({
      startDate: '2026-02-02', endDate: '2026-02-02', startTime: '09:00:00',
      returnTime: '17:00', durationDays: 1,
    })
  })

  it('all-nullish returns nulls', () => {
    expect(resolveRentalWindow({})).toEqual({
      startDate: null, endDate: null, startTime: null, returnTime: null, durationDays: null,
    })
  })
})
