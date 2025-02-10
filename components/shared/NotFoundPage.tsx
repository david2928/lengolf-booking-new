import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900">Page Not Found</h2>
        <p className="mt-2 text-gray-600">The page you're looking for doesn't exist.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-green-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
} 