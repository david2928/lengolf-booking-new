import Link from 'next/link';
import Image from 'next/image';
import logo from '../public/images/logo_v1.png';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
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
        
        <h1 className="mb-4 text-4xl font-bold text-gray-900">
          Welcome to LENGOLF
        </h1>
        
        <p className="mb-8 text-lg text-gray-600">
          Book your golf bay at The Mercury Ville @ BTS Chidlom
        </p>
        
        <Link
          href="/auth/login"
          className="inline-block rounded-lg bg-green-700 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-green-800"
        >
          Start Booking
        </Link>
      </div>
    </main>
  );
}
