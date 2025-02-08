'use client';

import Image from 'next/image';
import LoginForm from './_components/LoginForm';
import logo from '../../../public/images/logo_v1.png';

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <div className="text-center">
        <div className="mb-8">
          <Image
            src={logo}
            alt="LENGOLF Logo"
            width={200}
            height={100}
            priority
            className="mx-auto"
          />
        </div>

        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Choose your preferred login method
        </p>
      </div>

      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <LoginForm />
      </div>
    </div>
  );
} 