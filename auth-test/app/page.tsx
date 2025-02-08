import Image from "next/image";
import LoginButton from '../components/LoginButton'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm lg:flex">
        <div className="flex flex-col items-center gap-8">
          <h1 className="text-4xl font-bold">Supabase Auth Test</h1>
          <LoginButton />
        </div>
      </div>
    </main>
  );
}
