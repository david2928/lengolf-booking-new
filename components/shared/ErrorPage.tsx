'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          Something went wrong!
        </h2>
        <p className="mb-8 text-gray-600">
          {error.message || 'An unexpected error occurred'}
        </p>
        <div className="space-x-4">
          <button
            onClick={reset}
            className="inline-block rounded-lg bg-green-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-block rounded-lg bg-gray-100 px-6 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
} 