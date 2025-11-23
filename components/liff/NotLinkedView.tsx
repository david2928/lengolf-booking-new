'use client';

export default function NotLinkedView() {
  const handleContactLine = () => {
    window.location.href = 'https://lin.ee/Msff8Ap';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-xl">
        {/* Lock Icon */}
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-200">
          <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Member Access Required
        </h2>
        <p className="text-gray-600 text-sm mb-8 leading-relaxed">
          It looks like your LINE account isn&apos;t linked to a LENGOLF player profile yet.
        </p>

        <button
          onClick={handleContactLine}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <span>Contact Staff to Link</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </button>
      </div>
    </div>
  );
}