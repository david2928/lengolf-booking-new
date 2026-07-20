/**
 * Pure helpers for the chat widget's polling loop.
 *
 * The widget polls /api/chat/messages instead of holding an anon-key
 * realtime subscription (anon SELECT on web_chat_messages was revoked in
 * the 2026-07 Supabase security hardening). These helpers merge, diff, and
 * summarize each poll result into local state.
 */

export interface PollableMessage {
  id: string;
  created_at: string;
  sender_type: 'customer' | 'bot' | 'staff';
  is_read: boolean;
}

/** Union prev + incoming by id (server copy wins), sorted by created_at ascending. */
export function mergeMessages<T extends PollableMessage>(prev: T[], incoming: T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => {
    const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/** Incoming messages whose id is not already in prev. */
export function diffNew<T extends PollableMessage>(prev: T[], incoming: T[]): T[] {
  const known = new Set(prev.map((m) => m.id));
  return incoming.filter((m) => !known.has(m.id));
}

/** Unread messages from bot/staff (customer's own messages never count). */
export function countUnread(messages: PollableMessage[]): number {
  return messages.filter((m) => !m.is_read && m.sender_type !== 'customer').length;
}
