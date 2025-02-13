'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function ErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorMessage = (error: string) => {
    switch (error) {
      case 'AccessDenied':
        return 'Access denied. Please make sure you have granted all required permissions.';
      case 'Configuration':
        return 'There is a problem with the server configuration.';
      case 'Verification':
        return 'The verification link may have expired or has already been used.';
      case 'OAuthSignin':
        return 'Error occurred while signing in with the provider.';
      case 'OAuthCallback':
        return 'Error occurred while processing the authentication callback.';
      case 'OAuthCreateAccount':
        return 'Could not create user account.';
      case 'EmailCreateAccount':
        return 'Could not create user account with email.';
      case 'Callback':
        return 'Error occurred during the authentication callback.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center">
          <div className="relative w-[180px] h-[60px] mb-8">
            <Image
              src="/images/logo_v1.png"
              alt="LENGOLF Logo"
              fill
              priority
              sizes="180px"
              className="object-contain"
            />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            Authentication Error
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {error ? getErrorMessage(error) : 'An error occurred during authentication'}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Link
            href="/auth/login"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Try Again
          </Link>
          <Link
            href="/"
            className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
} 