'use client';

import { useState } from 'react';

interface PreferencesFormProps {
  token: string;
  initialOptIn: boolean;
  /** Pre-render the unsubscribe-confirmation CTA (from `?unsubscribe=1`). */
  unsubscribePrompt: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; optIn: boolean }
  | { kind: 'error'; message: string };

export default function PreferencesForm({
  token,
  initialOptIn,
  unsubscribePrompt,
}: PreferencesFormProps) {
  const [optIn, setOptIn] = useState<boolean>(initialOptIn);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function persist(nextValue: boolean) {
    setStatus({ kind: 'saving' });
    try {
      const res = await fetch(`/api/preferences/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketing_opt_in: nextValue }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setOptIn(nextValue);
      setStatus({ kind: 'saved', optIn: nextValue });
    } catch (err) {
      console.error('[preferences] save failed', err);
      setStatus({
        kind: 'error',
        message: 'Could not save your preferences. Please try again.',
      });
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    void persist(optIn);
  }

  function handleUnsubscribeAll() {
    void persist(false);
  }

  const saving = status.kind === 'saving';

  return (
    <form
      onSubmit={handleSave}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4"
    >
      {unsubscribePrompt && optIn && status.kind === 'idle' && (
        <div
          className="rounded-md p-3 text-sm"
          style={{
            backgroundColor: 'rgba(0, 90, 50, 0.08)',
            border: '1px solid rgba(0, 90, 50, 0.4)',
            color: '#003a20',
          }}
        >
          Click <strong>Unsubscribe from everything</strong> below to confirm
          you&apos;d like to stop receiving marketing emails.
        </div>
      )}

      {/* News & offers toggle */}
      <label
        className="flex items-start gap-3 p-3 rounded-md cursor-pointer"
        style={{
          backgroundColor: 'rgba(0, 90, 50, 0.08)',
          border: '1px solid rgba(0, 90, 50, 0.4)',
        }}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[#005a32]"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          disabled={saving}
        />
        <span className="text-sm text-gray-800">
          <span className="font-medium block">News &amp; offers</span>
          <span className="text-gray-600">
            Bay deals, coaching promos, and member events.
          </span>
        </span>
      </label>

      {/* Booking confirmations (always-on) */}
      <label className="flex items-start gap-3 p-3 rounded-md bg-gray-50 border border-gray-200 cursor-not-allowed">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[#005a32]"
          checked
          disabled
          readOnly
        />
        <span className="text-sm text-gray-800">
          <span className="font-medium block">Booking confirmations &amp; receipts</span>
          <span className="text-gray-500">
            Required for service — we always send these for active bookings.
          </span>
        </span>
      </label>

      {/* Status messages */}
      {status.kind === 'saved' && (
        <p className="text-sm text-emerald-700">
          {status.optIn
            ? "Saved — you're subscribed to news & offers."
            : "Saved — you've unsubscribed from marketing emails."}
        </p>
      )}
      {status.kind === 'error' && (
        <p className="text-sm text-red-700">{status.message}</p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handleUnsubscribeAll}
          disabled={saving || !optIn}
          className="text-sm text-gray-600 hover:text-gray-900 underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed self-start"
        >
          Unsubscribe from everything
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex justify-center items-center px-5 py-2.5 rounded-md text-sm font-medium text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#005a32' }}
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </form>
  );
}
