/**
 * Append an event to public.club_rental_order_events — the shared order activity
 * log (created by lengolf-forms PR #148). Best-effort: a logging hiccup must never
 * block the action it records, and a missing table degrades to a console error.
 * Mirrors lengolf-forms `src/lib/club-rental/order-events.ts`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type OrderEventType =
  | 'created'
  | 'note'
  | 'edit'
  | 'cancelled'
  | 'checked_out'
  | 'returned'
  | 'payment'
  | 'line_sent'
  | 'customer_confirmed';

export interface OrderEventInput {
  orderId: string;
  eventType: OrderEventType;
  summary: string;
  detail?: string | null;
  actor: string;
  actorEmail?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

export async function logOrderEvent(admin: any, e: OrderEventInput): Promise<void> {
  try {
    const { error } = await admin.from('club_rental_order_events').insert({
      order_id: e.orderId,
      event_type: e.eventType,
      summary: e.summary.slice(0, 200),
      detail: e.detail ? String(e.detail).slice(0, 1000) : null,
      actor: (e.actor || 'System').slice(0, 100),
      actor_email: e.actorEmail ? e.actorEmail.slice(0, 200) : null,
      old_data: e.oldData ?? null,
      new_data: e.newData ?? null,
    });
    if (error) console.error('[ClubOrderEvents] insert error', error);
  } catch (err) {
    console.error('[ClubOrderEvents] log failed', err);
  }
}
