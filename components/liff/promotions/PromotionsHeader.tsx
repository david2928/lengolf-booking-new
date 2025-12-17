'use client';

interface PromotionsHeaderProps {
  onClose?: () => void;
}

export default function PromotionsHeader({ onClose }: PromotionsHeaderProps) {
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (typeof window !== 'undefined' && window.liff?.closeWindow) {
      window.liff.closeWindow();
    } else {
      // Fallback to going back
      window.history.back();
    }
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
      {/* Close Button */}
      <button
        onClick={handleClose}
        className="p-2 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors pointer-events-auto"
        aria-label="Close"
      >
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
