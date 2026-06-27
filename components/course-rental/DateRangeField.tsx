'use client';

import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useFormatter, useTranslations } from 'next-intl';
import { CalendarDaysIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface DateRangeFieldProps {
  /** yyyy-mm-dd or '' */
  startDate: string;
  /** yyyy-mm-dd or '' */
  endDate: string;
  /** yyyy-mm-dd — earliest selectable day (today). */
  minDate: string;
  /** Commits start + end together (both yyyy-mm-dd; equal for a 1-day rental). */
  onChange: (start: string, end: string) => void;
}

/** Parse a yyyy-mm-dd string as a LOCAL date (avoids the UTC shift of new Date(str)). */
function parseLocal(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Format a Date as a LOCAL yyyy-mm-dd string. */
function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Single trigger + modal range calendar for the course-rental dates. Replaces
 * the two side-by-side native date inputs (which clipped on mobile). One tap
 * opens a react-day-picker range calendar (same library + green theme as the
 * bay-booking flow); the customer taps pickup then return — or one day for a
 * 1-day rental — and Done commits both dates at once.
 */
export function DateRangeField({ startDate, endDate, minDate, onChange }: DateRangeFieldProps) {
  const t = useTranslations('courseRental.dates');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const from = parseLocal(startDate);
  const to = parseLocal(endDate);
  const min = parseLocal(minDate) ?? new Date();

  const fmt = (d: Date) => format.dateTime(d, { day: 'numeric', month: 'short', year: 'numeric' });

  const triggerLabel =
    from && to ? `${fmt(from)} → ${fmt(to)}` : t('rangePlaceholder');

  function openModal() {
    setDraft(from ? { from, to: to ?? from } : undefined);
    setOpen(true);
  }

  function apply() {
    if (draft?.from) {
      const f = draft.from;
      const tt = draft.to ?? draft.from; // one tap = 1-day rental
      onChange(formatLocal(f), formatLocal(tt));
    }
    setOpen(false);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{t('rangeLabel')}</label>
      <button
        type="button"
        onClick={openModal}
        className="flex w-full items-center justify-between rounded-xl border border-gray-300 bg-white px-4 py-3 text-left text-base focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      >
        <span className={from && to ? 'text-gray-900' : 'text-gray-400'}>{triggerLabel}</span>
        <CalendarDaysIcon className="h-5 w-5 flex-none text-gray-400" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('rangeModalTitle')}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label={t('rangeClose')}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-500">
              {draft?.from && draft?.to
                ? `${fmt(draft.from)} → ${fmt(draft.to)}`
                : draft?.from
                  ? t('rangeHintPickEnd')
                  : t('rangeHintPickStart')}
            </p>

            <div className="rdp-course-rental flex justify-center">
              <DayPicker
                mode="range"
                selected={draft}
                onSelect={setDraft}
                disabled={{ before: min }}
                startMonth={min}
                defaultMonth={draft?.from ?? min}
                numberOfMonths={1}
              />
            </div>

            <button
              type="button"
              onClick={apply}
              disabled={!draft?.from}
              className="mt-2 w-full rounded-xl bg-green-600 py-2.5 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {t('rangeDone')}
            </button>

            <style jsx global>{`
              .rdp-course-rental .rdp-root {
                --rdp-accent-color: rgb(22 163 74);
                --rdp-accent-background-color: rgb(220 252 231);
                --rdp-today-color: rgb(22 163 74);
                --rdp-day-width: 40px;
                --rdp-day-height: 40px;
                margin: 0;
              }
              .rdp-course-rental .rdp-chevron {
                fill: rgb(22 163 74);
              }
              .rdp-course-rental .rdp-today:not(.rdp-selected) .rdp-day_button {
                font-weight: 700;
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}
