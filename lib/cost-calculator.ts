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
  detail?: string;
  detailTh?: string;
  amount: number;
  isCoveredByPackage?: boolean;
  packageName?: string;
  originalAmount?: number; // for strikethrough display
}

export interface CostDiscount {
  id: string;
  label: string;
  labelTh?: string;
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
}

// --- Helpers ---

function getTimeSlotLabel(hour: number): string {
  const slot = timeSlots.find(s => hour >= s.startHour && hour < s.endHour);
  return slot?.label.en ?? 'Custom';
}

function getTimeSlotLabelTh(hour: number): string {
  const slot = timeSlots.find(s => hour >= s.startHour && hour < s.endHour);
  return slot?.label.th ?? 'อื่นๆ';
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

  const startHour = parseInt(startTime?.split(':')[0], 10);
  if (isNaN(startHour) || duration <= 0) {
    return {
      lineItems: [], discounts: [], subtotal: 0, totalDiscount: 0,
      estimatedTotal: 0, isWeekend: false, timeSlotLabel: '', hourlyRate: 0,
      notes, notesTh,
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
    // Play & Food package replaces bay rate
    lineItems.push({
      id: 'play-food',
      label: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      labelTh: `${playFoodPkg.name} — ${playFoodPkg.displayName}`,
      detail: `${playFoodPkg.duration}hr bay time + food & drinks`,
      detailTh: `${playFoodPkg.duration} ชม. + อาหารและเครื่องดื่ม`,
      amount: playFoodPkg.price,
    });
  } else if (packageCoversThisSlot) {
    // Package covers bay rate
    lineItems.push({
      id: 'bay-rate',
      label: 'Bay Rate',
      labelTh: 'ค่าเบย์',
      detail: `${duration}hr × ฿${hourlyRate.toLocaleString()}/hr (${isWeekend ? 'Weekend' : 'Weekday'}, ${timeSlotLabel})`,
      detailTh: `${duration} ชม. × ฿${hourlyRate.toLocaleString()}/ชม. (${isWeekend ? 'สุดสัปดาห์' : 'วันธรรมดา'}, ${getTimeSlotLabelTh(startHour)})`,
      amount: 0,
      isCoveredByPackage: true,
      packageName: packageDisplayName,
      originalAmount: hourlyRate * duration,
    });
    notes.push(`Bay rate covered by ${packageDisplayName ?? 'your package'}`);
    notesTh.push(`ค่าเบย์รวมอยู่ในแพ็กเกจ ${packageDisplayName ?? 'ของคุณ'}`);
  } else {
    // Normal bay rate (or Early Bird package that doesn't cover this slot)
    const bayTotal = hourlyRate * duration;
    const originalRate = rate
      ? (isWeekend ? rate.originalWeekendPrice : rate.originalWeekdayPrice)
      : undefined;
    const originalTotal = originalRate ? originalRate * duration : undefined;

    lineItems.push({
      id: 'bay-rate',
      label: 'Bay Rate',
      labelTh: 'ค่าเบย์',
      detail: `${duration}hr × ฿${hourlyRate.toLocaleString()}/hr (${isWeekend ? 'Weekend' : 'Weekday'}, ${timeSlotLabel})`,
      detailTh: `${duration} ชม. × ฿${hourlyRate.toLocaleString()}/ชม. (${isWeekend ? 'สุดสัปดาห์' : 'วันธรรมดา'}, ${getTimeSlotLabelTh(startHour)})`,
      amount: bayTotal,
      originalAmount: originalTotal,
    });

    if (hasActivePackage && isEarlyBirdPackage && startHour >= 14) {
      notes.push(`${packageDisplayName ?? 'Your package'} covers morning hours only (before 14:00)`);
      notesTh.push(`${packageDisplayName ?? 'แพ็กเกจของคุณ'} ใช้ได้เฉพาะช่วงเช้า (ก่อน 14:00) เท่านั้น`);
    }
  }

  // 2. Club Rental
  if (clubRentalId && clubRentalId !== 'none' && clubRentalId !== 'standard') {
    const rentalCost = getClubRentalCost(clubRentalId, duration);
    lineItems.push({
      id: 'club-rental',
      label: `Club Rental — ${getClubDisplayName(clubRentalId)}`,
      labelTh: `เช่าไม้กอล์ฟ — ${getClubDisplayName(clubRentalId)}`,
      detail: `${duration}hr`,
      detailTh: `${duration} ชม.`,
      amount: rentalCost,
    });
  } else if (clubRentalId === 'standard') {
    lineItems.push({
      id: 'club-rental',
      label: 'Club Rental — Standard Set',
      labelTh: 'เช่าไม้กอล์ฟ — ชุดมาตรฐาน',
      detail: 'Complimentary',
      detailTh: 'ฟรี',
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
            label: `${promo.title_en} (${freeHours} free hr${freeHours > 1 ? 's' : ''})`,
            labelTh: `${promo.title_th} (ฟรี ${freeHours} ชม.)`,
            amount: -discountAmount,
            promotionId: promo.id,
          });
        }
      } else {
        // 1-hour booking: hint about the free hour they can redeem within 7 days
        notes.push(`🎉 ${promo.title_en} — Book 2 hours to get 1 hour free! Or redeem your free hour within 7 days`);
        notesTh.push(`🎉 ${promo.title_th} — จอง 2 ชม. เพื่อรับฟรี 1 ชม.! หรือใช้สิทธิ์ฟรีภายใน 7 วัน`);
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
          discounts.push({
            id: `promo-${promo.id}`,
            label: `${promo.title_en} (${promo.discount_value}% off)`,
            labelTh: `${promo.title_th} (ลด ${promo.discount_value}%)`,
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
  };
}
