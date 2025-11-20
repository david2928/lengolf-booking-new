'use client';

interface NotLinkedViewProps {
  onContactLine?: () => void;
}

export default function NotLinkedView({ onContactLine }: NotLinkedViewProps) {
  const handleContactLine = () => {
    // Open LINE chat with @lengolf
    if (typeof window !== 'undefined' && window.liff) {
      window.liff.openWindow({
        url: 'https://line.me/R/ti/p/@lengolf',
        external: true
      });
    } else {
      // Fallback: open in new window
      window.open('https://line.me/R/ti/p/@lengolf', '_blank');
    }

    if (onContactLine) {
      onContactLine();
    }
  };

  return (
    <div className="min-h-screen bg-[#f5fef9] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        {/* Icon */}
        <div className="w-20 h-20 bg-[#f5fef9] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-[#005a32]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
          Account Not Linked
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          To participate in lucky draws, please link your LINE account with your customer profile.
        </p>

        {/* Contact Info Box */}
        <div className="bg-[#f5fef9] border border-[#005a32]/20 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
            📱 Contact us to link your account:
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center">
              <svg className="w-4 h-4 text-[#005a32] mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span>LINE Official: <strong>@lengolf</strong></span>
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 text-[#005a32] mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span>Visit our store in person</span>
            </li>
          </ul>
        </div>

        {/* Helper Text */}
        <p className="text-xs text-gray-500 text-center mb-6">
          Our staff will help link your account in just a few minutes!
        </p>

        {/* Action Button */}
        <button
          onClick={handleContactLine}
          className="w-full bg-[#005a32] text-white px-6 py-3 rounded-md hover:bg-[#004225] transition-colors font-medium flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.69-.28-3.88-.78l-.28-.13-2.91.49.49-2.91-.13-.28C4.78 14.69 4.5 13.38 4.5 12 4.5 7.86 7.86 4.5 12 4.5S19.5 7.86 19.5 12 16.14 19.5 12 19.5z"/>
          </svg>
          💬 Contact on LINE
        </button>
      </div>
    </div>
  );
}
