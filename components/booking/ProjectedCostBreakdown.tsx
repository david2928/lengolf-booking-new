'use client';

import type { CostBreakdown, CostLineItem, CostDiscount } from '@/lib/cost-calculator';

type Language = 'en' | 'th' | 'ja' | 'ko' | 'zh';

interface ProjectedCostBreakdownProps {
  breakdown: CostBreakdown;
  isLoading?: boolean;
  language?: Language;
}

function formatCurrency(amount: number): string {
  return `฿${Math.abs(amount).toLocaleString()}`;
}

// UI chrome strings kept inline so this component can render both inside
// next-intl (main booking flow) and outside it (LIFF booking flow) without
// a provider.
const UI: Record<Language, {
  estimatedCost: string;
  paymentAtVenue: string;
  estimatedTotal: string;
  free: string;
  coveredByPackage: string;
  coveredByPackageNamed: (name: string) => string;
}> = {
  en: {
    estimatedCost: 'Estimated Cost',
    paymentAtVenue: 'Payment at venue',
    estimatedTotal: 'Estimated Total',
    free: 'Free',
    coveredByPackage: 'Covered by package',
    coveredByPackageNamed: (name) => `Covered by ${name}`,
  },
  th: {
    estimatedCost: 'ราคาประมาณการ',
    paymentAtVenue: 'ชำระที่สถานที่',
    estimatedTotal: 'รวมประมาณการ',
    free: 'ฟรี',
    coveredByPackage: 'รวมในแพ็กเกจ',
    coveredByPackageNamed: (name) => `รวมในแพ็กเกจ ${name}`,
  },
  ja: {
    estimatedCost: 'ご請求目安',
    paymentAtVenue: '会場でお支払い',
    estimatedTotal: '合計目安',
    free: '無料',
    coveredByPackage: 'パッケージに含む',
    coveredByPackageNamed: (name) => `${name}に含む`,
  },
  ko: {
    estimatedCost: '예상 금액',
    paymentAtVenue: '현장에서 결제',
    estimatedTotal: '예상 합계',
    free: '무료',
    coveredByPackage: '패키지 포함',
    coveredByPackageNamed: (name) => `${name} 포함`,
  },
  zh: {
    estimatedCost: '预估费用',
    paymentAtVenue: '现场付款',
    estimatedTotal: '预估合计',
    free: '免费',
    coveredByPackage: '已包含在套餐中',
    coveredByPackageNamed: (name) => `已包含在${name}中`,
  },
};

function pickLabel(
  item: CostLineItem | CostDiscount,
  language: Language,
): string {
  switch (language) {
    case 'th': return item.labelTh ?? item.label;
    case 'ja': return item.labelJa ?? item.label;
    case 'ko': return item.labelKo ?? item.label;
    case 'zh': return item.labelZh ?? item.label;
    default: return item.label;
  }
}

function pickDetail(item: CostLineItem, language: Language): string | undefined {
  switch (language) {
    case 'th': return item.detailTh ?? item.detail;
    case 'ja': return item.detailJa ?? item.detail;
    case 'ko': return item.detailKo ?? item.detail;
    case 'zh': return item.detailZh ?? item.detail;
    default: return item.detail;
  }
}

function pickNotes(breakdown: CostBreakdown, language: Language): string[] {
  switch (language) {
    case 'th': return breakdown.notesTh;
    case 'ja': return breakdown.notesJa ?? breakdown.notes;
    case 'ko': return breakdown.notesKo ?? breakdown.notes;
    case 'zh': return breakdown.notesZh ?? breakdown.notes;
    default: return breakdown.notes;
  }
}

export function ProjectedCostBreakdown({
  breakdown,
  isLoading,
  language = 'en',
}: ProjectedCostBreakdownProps) {
  const ui = UI[language];

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
        <h3 className="text-base font-semibold text-gray-900">{ui.estimatedCost}</h3>
        <span className="text-xs text-gray-400">{ui.paymentAtVenue}</span>
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        {breakdown.lineItems.map((item) => (
          <div key={item.id}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{pickLabel(item, language)}</span>
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
                    <span className="text-green-600">{ui.free}</span>
                  ) : formatCurrency(item.amount)
                )}
              </span>
            </div>
            {pickDetail(item, language) && (
              <p className="text-xs text-gray-400 mt-0.5">{pickDetail(item, language)}</p>
            )}
            {item.isCoveredByPackage && (
              <span className="inline-block mt-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                {item.packageName ? ui.coveredByPackageNamed(item.packageName) : ui.coveredByPackage}
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
              <span className="text-sm text-green-700">{pickLabel(discount, language)}</span>
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
          <span className="text-base font-semibold text-gray-900">{ui.estimatedTotal}</span>
          <span className="text-lg font-bold text-gray-900">
            {formatCurrency(breakdown.estimatedTotal)}
          </span>
        </div>
      </div>

      {/* Notes */}
      {pickNotes(breakdown, language).length > 0 && (
        <div className="mt-3 space-y-1">
          {pickNotes(breakdown, language).map((note, i) => (
            <p key={i} className="text-xs text-gray-400">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
