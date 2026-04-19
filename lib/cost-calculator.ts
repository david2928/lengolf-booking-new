/**
 * Cost Calculator for LENGOLF Bookings
 * Pure TypeScript module — no React dependencies.
 * Calculates projected cost breakdowns from booking parameters.
 */

import { isWeekendDate, getRateForTime, timeSlots } from '@/lib/liff/bay-rates-data';
import { getClubPricing, GOLF_CLUB_OPTIONS } from '@/types/golf-club-rental';
import { getPackageById } from '@/types/play-food-packages';

// --- Types ---

export interface ApplicablePromotion {
  id: string;
  promotion_type: 'bogo' | 'percentage' | 'fixed_amount' | 'bay_rate_override';
  discount_value?: number;
  free_hours?: number;
  applies_to: 'bay_rate' | 'club_rental' | 'total';
  conditions: Record<string, unknown>;
  title_en: string;
  title_th: string;
}

export interface CostCalculationInput {
  date: string;               // yyyy-MM-dd
  startTime: string;          // HH:mm
  duration: number;           // hours
  clubRentalId: string;       // 'none' | 'standard' | 'premium' | 'premium-plus'
  playFoodPackageId?: string | null;
  hasActivePackage: boolean;
  packageDisplayName?: string;
  isNewCustomer: boolean;
  applicablePromotions: ApplicablePromotion[];
}

export interface CostLineItem {
  id: string;
  label: string;
  labelTh?: string;
  labelJa?: string;
  labelKo?: string;
  labelZh?: string;
  detail?: string;
  detailTh?: string;
  detailJa?: string;
  detailKo?: string;
  detailZh?: string;
  amount: number;
  isCoveredByPackage?: boolean;
  packageName?: string;
  originalAmount?: number; // for strikethrough display
}

export interface CostDiscount {
  id: string;
  label: string;
  labelTh?: string;
  labelJa?: string;
  labelKo?: string;
  labelZh?: string;
  amount: number; // negative value
  promotionId?: string;
}

export interface CostBreakdown {
  lineItems: CostLineItem[];
  discounts: CostDiscount[];
  subtotal: number;
  totalDiscount: number;
  estimatedTotal: number;
  isWeekend: boolean;
  timeSlotLabel: string;
  hourlyRate: number;
  notes: string[];
  notesTh: string[];
  notesJa: string[];
  notesKo: string[];
  notesZh: string[];
}

// --- Helpers ---

function getTimeSlotLabel(hour: number, lang: 'en' | 'th' | 'ja' | 'ko' | 'zh' = 'en'): string {
  const slot = timeSlots.find(s => hour >= s.startHour && hour < s.endHour);
  const fallback: Record<'en' | 'th' | 'ja' | 'ko' | 'zh', string> = {
    en: 'Custom', th: 'อื่นๆ', ja: 'その他', ko: '기타', zh: '其他',
  };
  return slot?.label[lang] ?? fallback[lang];
}

const WEEKEND_LABEL = { en: 'Weekend', th: 'สุดสัปดาห์', ja: '週末', ko: '주말', zh: '周末' };
const WEEKDAY_LABEL = { en: 'Weekday', th: 'วันธรรมดา', ja: '平日', ko: '평일', zh: '工作日' };
const BAY_RATE_LABEL = { en: 'Bay Rate', th: 'ค่าเบย์', ja: 'ベイ料金', ko: '베이 요금', zh: '球位费用' };
const CLUB_RENTAL_PREFIX = {
  en: 'Club Rental', th: 'เช่าไม้กอล์ฟ', ja: 'クラブレンタル', ko: '클럽 렌탈', zh: '球杆租赁',
};
const STANDARD_SET_LABEL = {
  en: 'Standard Set', th: 'ชุดมาตรฐาน', ja: 'スタンダードセット', ko: '스탠다드 세트', zh: '标准套装',
};
const COMPLIMENTARY_LABEL = { en: 'Complimentary', th: 'ฟรี', ja: '無料', ko: '무료', zh: '免费' };

function buildBayRateDetail(
  lang: 'en' | 'th' | 'ja' | 'ko' | 'zh',
  duration: number,
  hourlyRate: number,
  isWeekend: boolean,
  startHour: number,
): string {
  const rate = `฿${hourlyRate.toLocaleString()}`;
  const dayLabel = isWeekend ? WEEKEND_LABEL[lang] : WEEKDAY_LABEL[lang];
  const slot = getTimeSlotLabel(startHour, lang);
  switch (lang) {
    case 'th':
      return `${duration} ชม. × ${rate}/ชม. (${dayLabel}, ${slot})`;
    case 'ja':
      return `${duration}時間 × ${rate}/時間 (${dayLabel}、${slot})`;
    case 'ko':
      return `${duration}시간 × ${rate}/시간 (${dayLabel}, ${slot})`;
    case 'zh':
      return `${duration}小时 × ${rate}/小时 (${dayLabel}, ${slot})`;
    default:
      return `${duration}hr × ${rate}/hr (${dayLabel}, ${slot})`;
  }
}

function buildDurationDetail(lang: 'en' | 'th' | 'ja' | 'ko' | 'zh', duration: number): string {
  switch (lang) {
    case 'th': return `${duration} ชม.`;
    case 'ja': return `${duration}時間`;
    case 'ko': return `${duration}시간`;
    case 'zh': return `${duration}小时`;
    default: return `${duration}hr`;
  }
}

function getClubRentalCost(clubId: string, duration: number): number {
  if (clubId === 'none' || clubId === 'standard') return 0;
  const pricing = getClubPricing(clubId);
  if (!pricing.length) return 0;

  // Try exact duration match first
  const exact = pricing.find(p => p.duration === duration);
  if (exact) return exact.price;

  // Interpolate: use per-hour rate
  const club = GOLF_CLUB_OPTIONS.find(c => c.id === clubId);
  if (!club) return 0;
  return club.pricePerHour * duration;
}

function getClubDisplayName(clubId: string): string {
  const club = GOLF_CLUB_OPTIONS.find(c => c.id === clubId);
  return club?.name ?? clubId;
}

// --- Main Calculator ---

export function calculateCost(input: CostCalculationInput): CostBreakdown {
  const {
    date,
    startTime,
    duration,
    clubRentalId,
    playFoodPackageId,
    hasActivePackage,
    packageDisplayName,
    isNewCustomer,
    applicablePromotions,
  } = input;

  const lineItems: CostLineItem[] = [];
  const discounts: CostDiscount[] = [];
  const notes: string[] = ['Estimate only — payment at venue'];
  const notesTh: string[] = ['ราคาประมาณการ — ชำระที่สถานที่'];
  const notesJa: string[] = ['ご予約時の見積もり — 会場でお支払い'];
  const notesKo: string[] = ['예상 금액 — 현장에서 결제'];
  const notesZh: string[] = ['预估价格 — 现场付款'];

  const startHour = parseInt(startTime?.split(':')[0], 10);
  if (isNaN(startHour) || duration <= 0) {
    return {
      lineItems: [], discounts: [], subtotal: 0, totalDiscount: 0,
      estimatedTotal: 0, isWeekend: false, timeSlotLabel: '', hourlyRate: 0,
      notes, notesTh, notesJa, notesKo, notesZh,
    };
  }
  const isWeekend = isWeekendDate(date);
  const rate = getRateForTime(startHour);
  const hourlyRate = rate
    ? (isWeekend ? rate.weekendPrice : rate.weekdayPrice)
    : 0;
  const timeSlotLabel = getTimeSlotLabel(startHour);

  // 1. Bay Rate / Play & Food Package
  const playFoodPkg = playFoodPackageId ? getPackageById(playFoodPackageId) : null;

  // Early Bird packages only cover morning slot (before 14:00)
  // Detection relies on CRM package display name containing "Early Bird"
  const isEarlyBirdPackage = packageDisplayName
    ? /early\s*bird/i.test(packageDisplayName)
    : false;
  const packageCoversThisSlot = hasActivePackage && (!isEarlyBirdPackage || startHour < 14);

  if (playFoodPkg) {
    // Play & Food package replaces bay rate. Package name is brand data;
    // keep it untranslated across locales.
    lineItems.push({
      id: 'play-food',
      label: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      labelTh: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      labelJa: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      labelKo: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      labelZh: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      detail: `${playFoodPkg.duration}hr bay time + food & drinks`,
      detailTh: `${playFoodPkg.duration} ชม. + อาหารและเครื่องดื่ม`,
      detailJa: `${playFoodPkg.duration}時間のベイ利用 + お食事とドリンク`,
      detailKo: `${playFoodPkg.duration}시간 베이 이용 + 식사와 음료`,
      detailZh: `${playFoodPkg.duration}小时球位使用 + 餐饮`,
      amount: playFoodPkg.price,
    });
  } else if (packageCoversThisSlot) {
    lineItems.push({
      id: 'bay-rate',
      label: BAY_RATE_LABEL.en,
      labelTh: BAY_RATE_LABEL.th,
      labelJa: BAY_RATE_LABEL.ja,
      labelKo: BAY_RATE_LABEL.ko,
      labelZh: BAY_RATE_LABEL.zh,
      detail: buildBayRateDetail('en', duration, hourlyRate, isWeekend, startHour),
      detailTh: buildBayRateDetail('th', duration, hourlyRate, isWeekend, startHour),
      detailJa: buildBayRateDetail('ja', duration, hourlyRate, isWeekend, startHour),
      detailKo: buildBayRateDetail('ko', duration, hourlyRate, isWeekend, startHour),
      detailZh: buildBayRateDetail('zh', duration, hourlyRate, isWeekend, startHour),
      amount: 0,
      isCoveredByPackage: true,
      packageName: packageDisplayName,
      originalAmount: hourlyRate * duration,
    });
    notes.push(`Bay rate covered by ${packageDisplayName ?? 'your package'}`);
    notesTh.push(`ค่าเบย์รวมอยู่ในแพ็กเกจ ${packageDisplayName ?? 'ของคุณ'}`);
    notesJa.push(`ベイ料金は${packageDisplayName ?? 'お客様のパッケージ'}に含まれています`);
    notesKo.push(`베이 요금은 ${packageDisplayName ?? '회원님의 패키지'}에 포함되어 있습니다`);
    notesZh.push(`球位费用已包含在${packageDisplayName ?? '您的套餐'}中`);
  } else {
    const bayTotal = hourlyRate * duration;
    const originalRate = rate
      ? (isWeekend ? rate.originalWeekendPrice : rate.originalWeekdayPrice)
      : undefined;
    const originalTotal = originalRate ? originalRate * duration : undefined;

    lineItems.push({
      id: 'bay-rate',
      label: BAY_RATE_LABEL.en,
      labelTh: BAY_RATE_LABEL.th,
      labelJa: BAY_RATE_LABEL.ja,
      labelKo: BAY_RATE_LABEL.ko,
      labelZh: BAY_RATE_LABEL.zh,
      detail: buildBayRateDetail('en', duration, hourlyRate, isWeekend, startHour),
      detailTh: buildBayRateDetail('th', duration, hourlyRate, isWeekend, startHour),
      detailJa: buildBayRateDetail('ja', duration, hourlyRate, isWeekend, startHour),
      detailKo: buildBayRateDetail('ko', duration, hourlyRate, isWeekend, startHour),
      detailZh: buildBayRateDetail('zh', duration, hourlyRate, isWeekend, startHour),
      amount: bayTotal,
      originalAmount: originalTotal,
    });

    if (hasActivePackage && isEarlyBirdPackage && startHour >= 14) {
      const pkg = packageDisplayName;
      notes.push(`${pkg ?? 'Your package'} covers morning hours only (before 14:00)`);
      notesTh.push(`${pkg ?? 'แพ็กเกจของคุณ'} ใช้ได้เฉพาะช่วงเช้า (ก่อน 14:00) เท่านั้น`);
      notesJa.push(`${pkg ?? 'お客様のパッケージ'}は午前の時間帯のみご利用いただけます（14:00前）`);
      notesKo.push(`${pkg ?? '회원님의 패키지'}는 오전 시간대에만 이용 가능합니다 (14:00 이전)`);
      notesZh.push(`${pkg ?? '您的套餐'}仅在上午时段有效（14:00之前）`);
    }
  }

  // 2. Club Rental — club display name is brand data, kept untranslated.
  if (clubRentalId && clubRentalId !== 'none' && clubRentalId !== 'standard') {
    const rentalCost = getClubRentalCost(clubRentalId, duration);
    const clubName = getClubDisplayName(clubRentalId);
    lineItems.push({
      id: 'club-rental',
      label: `${CLUB_RENTAL_PREFIX.en} — ${clubName}`,
      labelTh: `${CLUB_RENTAL_PREFIX.th} — ${clubName}`,
      labelJa: `${CLUB_RENTAL_PREFIX.ja} — ${clubName}`,
      labelKo: `${CLUB_RENTAL_PREFIX.ko} — ${clubName}`,
      labelZh: `${CLUB_RENTAL_PREFIX.zh} — ${clubName}`,
      detail: buildDurationDetail('en', duration),
      detailTh: buildDurationDetail('th', duration),
      detailJa: buildDurationDetail('ja', duration),
      detailKo: buildDurationDetail('ko', duration),
      detailZh: buildDurationDetail('zh', duration),
      amount: rentalCost,
    });
  } else if (clubRentalId === 'standard') {
    lineItems.push({
      id: 'club-rental',
      label: `${CLUB_RENTAL_PREFIX.en} — ${STANDARD_SET_LABEL.en}`,
      labelTh: `${CLUB_RENTAL_PREFIX.th} — ${STANDARD_SET_LABEL.th}`,
      labelJa: `${CLUB_RENTAL_PREFIX.ja} — ${STANDARD_SET_LABEL.ja}`,
      labelKo: `${CLUB_RENTAL_PREFIX.ko} — ${STANDARD_SET_LABEL.ko}`,
      labelZh: `${CLUB_RENTAL_PREFIX.zh} — ${STANDARD_SET_LABEL.zh}`,
      detail: COMPLIMENTARY_LABEL.en,
      detailTh: COMPLIMENTARY_LABEL.th,
      detailJa: COMPLIMENTARY_LABEL.ja,
      detailKo: COMPLIMENTARY_LABEL.ko,
      detailZh: COMPLIMENTARY_LABEL.zh,
      amount: 0,
    });
  }

  // 3. Calculate subtotal before discounts
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  // 4. Apply promotions
  for (const promo of applicablePromotions) {
    // BOGO: 2+ hours → discount applied now; 1 hour → hint to book longer next time for free hour
    if (promo.promotion_type === 'bogo' && promo.free_hours) {
      const isNewCustomerOnly = promo.conditions?.new_customer_only === true;
      if (isNewCustomerOnly && !isNewCustomer) continue;
      if (packageCoversThisSlot || playFoodPkg) continue;

      if (duration >= 2) {
        // Apply free hour discount to current booking
        const freeHours = Math.min(promo.free_hours, duration - 1);
        const discountAmount = hourlyRate * freeHours;
        if (discountAmount > 0) {
          discounts.push({
            id: `promo-${promo.id}`,
            label: promo.title_en,
            labelTh: promo.title_th,
            // promo titles only carry title_en/title_th from the DB — fall
            // back to the English title for other locales until the promo
            // schema supports more.
            labelJa: promo.title_en,
            labelKo: promo.title_en,
            labelZh: promo.title_en,
            amount: -discountAmount,
            promotionId: promo.id,
          });
        }
      } else {
        notes.push(`🎉 ${promo.title_en} — Book 2 hours to get 1 hour free! Or redeem your free hour within 7 days`);
        notesTh.push(`🎉 ${promo.title_th} — จอง 2 ชม. เพื่อรับฟรี 1 ชม.! หรือใช้สิทธิ์ฟรีภายใน 7 วัน`);
        notesJa.push(`🎉 ${promo.title_en} — 2時間ご予約で1時間無料！または7日以内に無料時間をご利用ください`);
        notesKo.push(`🎉 ${promo.title_en} — 2시간 예약 시 1시간 무료! 또는 7일 이내에 무료 시간을 사용하세요`);
        notesZh.push(`🎉 ${promo.title_en} — 预订2小时即获1小时免费！或在7天内兑换您的免费时段`);
      }
    }

    // Percentage discount on bay rate
    if (promo.promotion_type === 'percentage' && promo.discount_value && promo.applies_to === 'bay_rate') {
      const isNewCustomerOnly = promo.conditions?.new_customer_only === true;
      if (isNewCustomerOnly && !isNewCustomer) continue;
      if (packageCoversThisSlot || playFoodPkg) continue;

      const bayItem = lineItems.find(item => item.id === 'bay-rate');
      if (bayItem) {
        const discountAmount = Math.round(bayItem.amount * (promo.discount_value / 100));
        if (discountAmount > 0) {
          const pct = promo.discount_value;
          discounts.push({
            id: `promo-${promo.id}`,
            label: `${promo.title_en} (${pct}% off)`,
            labelTh: `${promo.title_th} (ลด ${pct}%)`,
            labelJa: `${promo.title_en} (${pct}%オフ)`,
            labelKo: `${promo.title_en} (${pct}% 할인)`,
            labelZh: `${promo.title_en} (${pct}% 折扣)`,
            amount: -discountAmount,
            promotionId: promo.id,
          });
        }
      }
    }

    // Fixed amount discount
    if (promo.promotion_type === 'fixed_amount' && promo.discount_value) {
      const isNewCustomerOnly = promo.conditions?.new_customer_only === true;
      if (isNewCustomerOnly && !isNewCustomer) continue;
      if (promo.applies_to === 'bay_rate' && (packageCoversThisSlot || playFoodPkg)) continue;

      discounts.push({
        id: `promo-${promo.id}`,
        label: promo.title_en,
        labelTh: promo.title_th,
        labelJa: promo.title_en,
        labelKo: promo.title_en,
        labelZh: promo.title_en,
        amount: -promo.discount_value,
        promotionId: promo.id,
      });
    }
  }

  const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);
  const estimatedTotal = Math.max(0, subtotal + totalDiscount);

  return {
    lineItems,
    discounts,
    subtotal,
    totalDiscount,
    estimatedTotal,
    isWeekend,
    timeSlotLabel,
    hourlyRate,
    notes,
    notesTh,
    notesJa,
    notesKo,
    notesZh,
  };
}
