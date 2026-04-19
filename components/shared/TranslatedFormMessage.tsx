'use client';

import type { ReactNode } from 'react';
import { useFormField } from '@/components/ui/form';

/**
 * Drop-in replacement for shadcn's `<FormMessage />` when the error message
 * is derived from a translation key rather than the raw string stored in
 * the form state.
 *
 * Shadcn's `FormMessage` reads the error from context and renders it
 * verbatim, so a `{ message: 'validationNameMin' }` schema would display
 * the key string. This component accepts already-translated children and
 * wires the same `formMessageId` so `aria-describedby` on the input keeps
 * pointing at the visible error.
 */
export function TranslatedFormMessage({ children }: { children?: ReactNode }) {
  const { formMessageId } = useFormField();
  if (!children) return null;
  return (
    <p
      id={formMessageId}
      className="text-[0.8rem] font-medium text-destructive"
    >
      {children}
    </p>
  );
}
