export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        {children}
      </div>
    </main>
  );
} 