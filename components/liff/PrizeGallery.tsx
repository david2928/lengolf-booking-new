'use client';

interface Prize {
  id: string;
  prize_name: string;
  prize_description: string;
  redemption_code: string;
  spin_timestamp: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  redeemed_by_staff_name: string | null;
  draw_sequence: number;
}

interface PrizeGalleryProps {
  prizes: Prize[];
  onRedeem: (prize: Prize) => void;
}

export default function PrizeGallery({ prizes, onRedeem }: PrizeGalleryProps) {
  if (prizes.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>
        <p className="text-gray-500 text-sm">No prizes yet</p>
        <p className="text-gray-400 text-xs mt-1">Spin the wheel to win prizes!</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getPrizeIcon = (prizeName: string) => {
    if (prizeName.toLowerCase().includes('bay') || prizeName.toLowerCase().includes('hour')) {
      return '⏰';
    }
    if (prizeName.toLowerCase().includes('discount')) {
      return '🏷️';
    }
    if (prizeName.toLowerCase().includes('drink')) {
      return '🥤';
    }
    if (prizeName.toLowerCase().includes('voucher') || prizeName.toLowerCase().includes('thb')) {
      return '💰';
    }
    if (prizeName.toLowerCase().includes('lesson') || prizeName.toLowerCase().includes('coach')) {
      return '🏌️';
    }
    if (prizeName.toLowerCase().includes('luck')) {
      return '🍀';
    }
    return '🎁';
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Prizes</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {prizes.map((prize) => (
          <div
            key={prize.id}
            className={`relative bg-white border rounded-lg p-4 shadow-sm transition-all ${
              prize.is_redeemed
                ? 'border-gray-300 opacity-75'
                : 'border-[#005a32]/30 hover:shadow-md'
            }`}
          >
            {/* Status Badge */}
            <div className="absolute top-3 right-3">
              {prize.is_redeemed ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Redeemed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-full">
                  🎁 Pending
                </span>
              )}
            </div>

            {/* Prize Icon */}
            <div className="text-4xl mb-3">
              {getPrizeIcon(prize.prize_name)}
            </div>

            {/* Prize Name */}
            <h4 className="text-lg font-bold text-gray-900 mb-1 pr-20">
              {prize.prize_name}
            </h4>

            {/* Prize Description */}
            <p className="text-sm text-gray-600 mb-3">
              {prize.prize_description}
            </p>

            {/* Redemption Code */}
            <div className="bg-[#f5fef9] border border-[#005a32]/20 rounded-md p-2 mb-3">
              <p className="text-xs text-gray-500 mb-1">Redemption Code:</p>
              <p className="text-sm font-mono font-bold text-[#005a32] tracking-wide">
                {prize.redemption_code}
              </p>
            </div>

            {/* Date Info */}
            <div className="text-xs text-gray-500 mb-3">
              {prize.is_redeemed ? (
                <span>Redeemed: {formatDate(prize.redeemed_at!)}</span>
              ) : (
                <span>Won: {formatDate(prize.spin_timestamp)}</span>
              )}
            </div>

            {/* Action Button */}
            {!prize.is_redeemed && (
              <button
                onClick={() => onRedeem(prize)}
                className="w-full bg-[#005a32] text-white px-4 py-2 rounded-md hover:bg-[#004225] transition-colors text-sm font-medium"
              >
                Redeem with Staff
              </button>
            )}

            {prize.is_redeemed && prize.redeemed_by_staff_name && (
              <p className="text-xs text-gray-400 text-center">
                Redeemed by: {prize.redeemed_by_staff_name}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
