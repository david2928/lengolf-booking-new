'use client';

import type { CostBreakdown } from '@/lib/cost-calculator';

interface ProjectedCostBreakdownProps {
  breakdown: CostBreakdown;
  isLoading?: boolean;
  language?: 'en' | 'th' | 'ja' | 'zh';
}

function formatCurrency(amount: number): string {
  return `฿${Math.abs(amount).toLocaleString()}`;
}

export function ProjectedCostBreakdown({
  breakdown,
  isLoading,
  language = 'en',
}: ProjectedCostBreakdownProps) {
  const isThai = language === 'th';

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  const hasDiscounts = breakdown.discounts.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">
          {isThai ? 'ราคาประมาณการ' : 'Estimated Cost'}
        </h3>
        <span className="text-xs text-gray-400">
          {isThai ? 'ชำระที่สถานที่' : 'Payment at venue'}
        </span>
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        {breakdown.lineItems.map((item) => (
          <div key={item.id}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {isThai ? (item.labelTh ?? item.label) : item.label}
              </span>
              <span className="text-sm font-medium text-gray-900 ml-4 whitespace-nowrap">
                {item.isCoveredByPackage ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="line-through text-gray-400">
                      {formatCurrency(item.originalAmount ?? 0)}
                    </span>
                    <span className="text-green-600 font-semibold">฿0</span>
                  </span>
                ) : item.originalAmount && item.originalAmount > item.amount ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="line-through text-gray-400">
                      {formatCurrency(item.originalAmount)}
                    </span>
                    <span>{formatCurrency(item.amount)}</span>
                  </span>
                ) : (
                  item.amount === 0 ? (
                    <span className="text-green-600">{isThai ? 'ฟรี' : 'Free'}</span>
                  ) : formatCurrency(item.amount)
                )}
              </span>
            </div>
            {item.detail && (
              <p className="text-xs text-gray-400 mt-0.5">
                {isThai ? (item.detailTh ?? item.detail) : item.detail}
              </p>
            )}
            {item.isCoveredByPackage && (
              <span className="inline-block mt-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                {item.packageName
                  ? (isThai ? `รวมในแพ็กเกจ ${item.packageName}` : `Covered by ${item.packageName}`)
                  : (isThai ? 'รวมในแพ็กเกจ' : 'Covered by package')}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Discounts */}
      {hasDiscounts && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-2">
          {breakdown.discounts.map((discount) => (
            <div key={discount.id} className="flex items-center justify-between">
              <span className="text-sm text-green-700">
                {isThai ? (discount.labelTh ?? discount.label) : discount.label}
              </span>
              <span className="text-sm font-medium text-green-600 ml-4 whitespace-nowrap">
                -{formatCurrency(Math.abs(discount.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-gray-900">
            {isThai ? 'รวมประมาณการ' : 'Estimated Total'}
          </span>
          <span className="text-lg font-bold text-gray-900">
            {formatCurrency(breakdown.estimatedTotal)}
          </span>
        </div>
      </div>

      {/* Notes */}
      {(isThai ? breakdown.notesTh : breakdown.notes).length > 0 && (
        <div className="mt-3 space-y-1">
          {(isThai ? breakdown.notesTh : breakdown.notes).map((note, i) => (
            <p key={i} className="text-xs text-gray-400">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
