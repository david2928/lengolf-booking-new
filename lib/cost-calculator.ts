/**
 * Cost Calculator for LENGOLF Bookings
 * Pure TypeScript module — no React dependencies.
 * Calculates projected cost breakdowns from booking parameters.
 */

import { isWeekendDate, getRateForTime, getRateSegments, timeSlots } from '@/lib/liff/bay-rates-data';
import { getClubPricing, GOLF_CLUB_OPTIONS, getGearUpItems } from '@/types/golf-club-rental';
import { getPackageById } from '@/types/play-food-packages';
import { computePackageCoverage, HOUR_EPSILON } from '@/lib/package-coverage';

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
  /**
   * Gear-up items the customer added at booking (e.g. glove sale).
   * Map of gear-up item id -> selected. Item details (label, price) are
   * resolved via getGearUpItems() so DB-driven price changes flow through.
   */
  addOns?: Record<string, boolean>;
  playFoodPackageId?: string | null;
  hasActivePackage: boolean;
  packageDisplayName?: string;
  /**
   * Hours left on that package, when the caller knows them.
   *
   * OPTIONAL BY DESIGN. Omitted (or `null`) means "balance unknown" and the bay
   * line falls back to eligibility-only coverage — the whole package-eligible
   * window zeroed — which is byte-for-byte what this calculator did before the
   * input existed. That fallback is not just for legacy callers: the balance
   * arrives from a fetch, so it is genuinely unknown on first render, and
   * inventing a 0 there would flicker the total from ฿0 to a charge and back.
   *
   * When a balance IS supplied and it runs short of the booking, the covered
   * head of the booking stays covered and the uncovered TAIL becomes a charged
   * line — priced where it actually falls, so it prorates across 14:00/17:00.
   */
  packageRemainingHours?: number | null;
  /**
   * Unlimited packages cover their whole eligible window whatever the balance
   * says. Mirrors `PackageCoverageInput.isUnlimited`.
   */
  packageIsUnlimited?: boolean;
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
  /**
   * The one promotion this breakdown reflects — offers never stack, so at most
   * one ever wins. `undefined` when none was eligible.
   *
   * Read this, never a second eligibility pass, when another surface has to
   * agree with the customer's quote (the staff LINE note in
   * `app/api/bookings/create/route.ts` does). `discounts[0].promotionId` is NOT
   * a substitute: a sub-2-hour bogo wins by contributing ADVICE ("book 2 hours
   * to get 1 hour free") and pushes no discount row, yet it is still a promise
   * made to the customer that staff have to honour.
   *
   * Metadata only — no line item, discount, note or total depends on it.
   */
  appliedPromotionId?: string;
  subtotal: number;
  totalDiscount: number;
  estimatedTotal: number;
  isWeekend: boolean;
  timeSlotLabel: string;
  /**
   * @deprecated Start-slot rate only — a booking straddling 14:00/17:00 is
   * prorated across slots, so `hourlyRate * duration` is NOT the bay amount.
   * Read the `bay-rate` line item instead.
   */
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
const ADD_ON_PREFIX = { en: 'Add-on', th: 'เพิ่ม', ja: 'アドオン', ko: '추가 상품', zh: '加购' };

type Lang = 'en' | 'th' | 'ja' | 'ko' | 'zh';

/** Per-locale stand-in when the CRM gave us no package display name. */
const PACKAGE_FALLBACK_NAME: Record<Lang, string> = {
  en: 'Your package',
  th: 'แพ็กเกจของคุณ',
  ja: 'お客様のパッケージ',
  ko: '회원님의 패키지',
  zh: '您的套餐',
};

/**
 * Shown when the package's remaining-hours BALANCE does not stretch across the
 * booking. The uncovered tail is a real charged line in the breakdown, so this
 * only has to explain why a package holder is being billed for bay time — it
 * must not imply the amount sits outside the estimate.
 */
const PACKAGE_SHORTFALL_NOTE: Record<Lang, (pkg: string) => string> = {
  en: (p) => `${p} does not cover this whole booking. The uncovered time is charged at the normal rate`,
  th: (p) => `${p} ไม่ครอบคลุมการจองนี้ทั้งหมด เวลาส่วนที่ไม่ครอบคลุมคิดค่าบริการตามอัตราปกติ`,
  ja: (p) => `${p}ではこのご予約の全時間をカバーできません。カバーされない時間は通常料金となります`,
  ko: (p) => `${p}로는 이 예약 전체를 이용할 수 없습니다. 미포함 시간은 정상 요금이 부과됩니다`,
  zh: (p) => `${p}不足以涵盖整个预订。未涵盖的时间按正常价格收费`,
};

/**
 * Shown when more than one offer was eligible and only the best one was kept.
 *
 * Owner rule (confirmed 2026-07-25): offers never stack. A customer who knows
 * they hold two offers must not be left thinking one was forgotten, so the
 * losing offers are named rather than silently dropped.
 */
const BEST_OFFER_ONLY_NOTE: Record<Lang, (others: string) => string> = {
  en: (o) => `Only one offer applies per booking, so we applied the one worth the most. Also considered: ${o}`,
  th: (o) => `ใช้ได้เพียงหนึ่งโปรโมชันต่อการจอง เราใช้โปรโมชันที่คุ้มที่สุดให้คุณแล้ว โปรโมชันอื่นที่พิจารณา: ${o}`,
  ja: (o) => `1回のご予約に適用できる特典は1つのみです。最もお得な特典を適用しました。他に検討した特典：${o}`,
  ko: (o) => `예약당 하나의 혜택만 적용됩니다. 가장 유리한 혜택을 적용했습니다. 함께 검토한 혜택: ${o}`,
  zh: (o) => `每次预订仅可使用一项优惠，我们已为您选择最优惠的一项。同时考虑的优惠：${o}`,
};

/** Separator for the "also considered" offer list. CJK uses its own comma. */
const OFFER_LIST_SEPARATOR: Record<Lang, string> = {
  en: ', ', th: ', ', ja: '、', ko: ', ', zh: '、',
};

/** Note lines a promotion candidate would contribute, keyed by locale. */
type LocalizedNotes = Record<Lang, string[]>;

/**
 * What ONE eligible promotion would contribute to the breakdown, computed
 * without mutating it. Only the winning candidate is ever committed — see the
 * selection step in `calculateCost`.
 */
interface PromotionCandidate {
  /**
   * Promotion row id. Doubles as the tie-break key so the winner never depends
   * on the order `applicablePromotions` happened to arrive in.
   */
  promotionId: string;
  /**
   * Baht the customer saves if this candidate is applied — the sole ranking key.
   * Zero for a candidate that only carries advice (the sub-2-hour bogo), which
   * is why such a candidate can never out-rank a real discount.
   */
  value: number;
  /** Discount row to push. `null` for an advice-only candidate. */
  discount: CostDiscount | null;
  /** Notes to push if this candidate wins, in push order. */
  notes: LocalizedNotes;
  /** Titles used when naming this offer in the "also considered" disclosure. */
  titleEn: string;
  titleTh: string;
}

const emptyLocalizedNotes = (): LocalizedNotes => ({ en: [], th: [], ja: [], ko: [], zh: [] });

/** A booking portion priced at one rate (a booking may straddle slot boundaries). */
interface PricedSegment {
  hours: number;
  price: number;
  originalPrice?: number;
}

/**
 * Prorate a booking window across rate-slot boundaries (e.g. 13:30–14:30
 * weekday = 0.5h morning ฿550 + 0.5h afternoon ฿750). Returns one segment
 * per distinct (price, originalPrice) run.
 */
function getPricedSegments(startHour: number, duration: number, isWeekend: boolean): PricedSegment[] {
  const merged: PricedSegment[] = [];
  for (const { hours, rate } of getRateSegments(startHour, duration)) {
    const price = isWeekend ? rate.weekendPrice : rate.weekdayPrice;
    const originalPrice = isWeekend ? rate.originalWeekendPrice : rate.originalWeekdayPrice;
    const last = merged[merged.length - 1];
    if (last && last.price === price && last.originalPrice === originalPrice) {
      last.hours += hours;
    } else {
      merged.push({ hours, price, originalPrice });
    }
  }
  return merged;
}

function segmentsCost(segments: PricedSegment[]): number {
  return segments.reduce((sum, s) => sum + s.hours * s.price, 0);
}

function segmentsOriginalCost(segments: PricedSegment[]): number {
  return segments.reduce((sum, s) => sum + s.hours * (s.originalPrice ?? s.price), 0);
}

const HOUR_UNIT: Record<'en' | 'th' | 'ja' | 'ko' | 'zh', string> = {
  en: 'hr', th: ' ชม.', ja: '時間', ko: '시간', zh: '小时',
};

/** Display precision for fractional hours (0.5 stays 0.5; 1/3 → 0.33). */
function formatHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function buildBayRateDetail(
  lang: 'en' | 'th' | 'ja' | 'ko' | 'zh',
  segments: PricedSegment[],
  isWeekend: boolean,
  startHour: number,
): string {
  const dayLabel = isWeekend ? WEEKEND_LABEL[lang] : WEEKDAY_LABEL[lang];
  const unit = HOUR_UNIT[lang];

  // Display groups by price only (a promo original-price difference at the
  // same current price still reads as one rate).
  const groups: Array<{ hours: number; price: number }> = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    if (last && last.price === s.price) last.hours += s.hours;
    else groups.push({ hours: s.hours, price: s.price });
  }

  if (groups.length <= 1) {
    const duration = formatHours(groups[0]?.hours ?? 0);
    const rate = `฿${(groups[0]?.price ?? 0).toLocaleString()}`;
    // A booking crossing into a same-priced slot (e.g. 16:00–18:00 weekday)
    // merges to one price group but no longer fits the start slot's label —
    // drop the label rather than mislabel it.
    const slot = segments.length > 1 ? null : getTimeSlotLabel(startHour, lang);
    const suffix = slot ? `(${dayLabel}${lang === 'ja' ? '、' : ', '}${slot})` : `(${dayLabel})`;
    switch (lang) {
      case 'th':
        return `${duration} ชม. × ${rate}/ชม. ${suffix}`;
      case 'ja':
        return `${duration}時間 × ${rate}/時間 ${suffix}`;
      case 'ko':
        return `${duration}시간 × ${rate}/시간 ${suffix}`;
      case 'zh':
        return `${duration}小时 × ${rate}/小时 ${suffix}`;
      default:
        return `${duration}hr × ${rate}/hr ${suffix}`;
    }
  }

  const parts = groups
    .map((g) => `${formatHours(g.hours)}${unit} × ฿${g.price.toLocaleString()}`)
    .join(' + ');
  return `${parts} (${dayLabel})`;
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
    addOns,
    playFoodPackageId,
    hasActivePackage,
    packageDisplayName,
    packageRemainingHours,
    packageIsUnlimited,
    isNewCustomer,
    applicablePromotions,
  } = input;

  const lineItems: CostLineItem[] = [];
  const discounts: CostDiscount[] = [];
  const notes: string[] = ['Estimate only, payment at venue'];
  const notesTh: string[] = ['ราคาประมาณการ ชำระที่สถานที่'];
  const notesJa: string[] = ['ご予約時の見積もり、会場でお支払い'];
  const notesKo: string[] = ['예상 금액, 현장에서 결제'];
  const notesZh: string[] = ['预估价格，现场付款'];

  const [startHourPart, startMinutePart] = (startTime ?? '').split(':');
  const startHour = parseInt(startHourPart, 10);
  // !(duration > 0) also catches NaN, which `duration <= 0` lets through
  if (isNaN(startHour) || !(duration > 0)) {
    return {
      lineItems: [], discounts: [], subtotal: 0, totalDiscount: 0,
      estimatedTotal: 0, isWeekend: false, timeSlotLabel: '', hourlyRate: 0,
      notes, notesTh, notesJa, notesKo, notesZh,
    };
  }
  const startMinutes = parseInt(startMinutePart ?? '0', 10);
  // Fractional start (13:30 → 13.5) so bookings straddling a rate boundary
  // are prorated per portion instead of priced at the start slot's rate.
  const startFraction = startHour + (isNaN(startMinutes) ? 0 : startMinutes / 60);
  const isWeekend = isWeekendDate(date);
  const rate = getRateForTime(startHour);
  const hourlyRate = rate
    ? (isWeekend ? rate.weekendPrice : rate.weekdayPrice)
    : 0;
  const timeSlotLabel = getTimeSlotLabel(startHour);
  const baySegments = getPricedSegments(startFraction, duration, isWeekend);
  // Round to whole baht — odd start minutes (e.g. 13:20) yield fractional hours
  const bayCost = Math.round(segmentsCost(baySegments));

  // 1. Bay Rate / Play & Food Package
  const playFoodPkg = playFoodPackageId ? getPackageById(playFoodPackageId) : null;

  // Early Bird packages only cover hours before 14:00.
  // Detection relies on CRM package display name containing "Early Bird"
  const isEarlyBirdPackage = packageDisplayName
    ? /early\s*bird/i.test(packageDisplayName)
    : false;
  const EARLY_BIRD_CUTOFF = 14;
  const bookingEnd = startFraction + duration;
  // Venue policy (owner-confirmed Jul 2026): an Early Bird booking crossing
  // 14:00 is NOT fully covered — the pre-14:00 portion draws on the package
  // and the remainder is charged at the normal prorated rate (split branch
  // below). Fully covered only when the booking ends by 14:00.
  const packageCoversThisSlot = hasActivePackage
    && (!isEarlyBirdPackage || bookingEnd <= EARLY_BIRD_CUTOFF);
  const packageCoversPartially = hasActivePackage && isEarlyBirdPackage
    && !packageCoversThisSlot && startFraction < EARLY_BIRD_CUTOFF;
  // Promotions never stack on a booking the package pays for (fully or partially).
  // Deliberately keyed off ELIGIBILITY only, NOT the balance: a package that runs
  // short keeps exactly today's stacking behaviour.
  const packageAppliesToBay = packageCoversThisSlot || packageCoversPartially;

  // How many hours of the booking the package's BALANCE actually pays for.
  // `lib/package-coverage.ts` owns this arithmetic — the Early Bird 14:00 cap,
  // the unlimited case, the float-dust epsilon and the "unknown balance" guard
  // all live there, and we consume only its `coveredHours`.
  //
  // `null` means "no usable balance information": no balance supplied, an
  // unlimited package, or a balance that comfortably covers the eligible window.
  // In every one of those cases the eligibility-only windows below are used
  // unchanged, so the output is identical to before this input existed.
  const balanceCoverage = computePackageCoverage({
    date,
    startTime,
    duration,
    hasActivePackage,
    packageDisplayName,
    remainingHours: packageRemainingHours ?? null,
    isUnlimited: packageIsUnlimited,
    playFoodPackageId,
  });
  const balanceCoveredHours = balanceCoverage?.isPartial ? balanceCoverage.coveredHours : null;
  const packageRunsShort = balanceCoveredHours !== null;

  // The window the package pays for, and the remainder charged at normal rates.
  // TWO limits can cut the covered window short and they COMPOSE — an Early Bird
  // package stops at 14:00, and the balance runs out after `balanceCoveredHours`.
  // `coveredEnd` is whichever comes first, which keeps the charged tail
  // contiguous and priced from where it really starts.
  const packageEligibleEnd = packageCoversThisSlot
    ? bookingEnd
    : packageCoversPartially ? EARLY_BIRD_CUTOFF : startFraction;
  const packageCoveredEnd = packageRunsShort
    ? Math.min(packageEligibleEnd, startFraction + balanceCoveredHours!)
    : packageEligibleEnd;
  const packageCoveredHours = packageCoveredEnd - startFraction;
  const packageChargedHours = bookingEnd - packageCoveredEnd;

  const pushShortfallNote = () => {
    const named = (lang: Lang) =>
      PACKAGE_SHORTFALL_NOTE[lang](packageDisplayName ?? PACKAGE_FALLBACK_NAME[lang]);
    notes.push(named('en'));
    notesTh.push(named('th'));
    notesJa.push(named('ja'));
    notesKo.push(named('ko'));
    notesZh.push(named('zh'));
  };

  if (playFoodPkg) {
    // Play & Food package replaces bay rate. Package name is brand data;
    // keep it untranslated across locales.
    lineItems.push({
      id: 'play-food',
      label: `${playFoodPkg.name}: ${playFoodPkg.displayName}`,
      labelTh: `${playFoodPkg.name}: ${playFoodPkg.displayName}`,
      labelJa: `${playFoodPkg.name}：${playFoodPkg.displayName}`,
      labelKo: `${playFoodPkg.name}: ${playFoodPkg.displayName}`,
      labelZh: `${playFoodPkg.name}：${playFoodPkg.displayName}`,
      detail: `${playFoodPkg.duration}hr bay time + food & drinks`,
      detailTh: `${playFoodPkg.duration} ชม. + อาหารและเครื่องดื่ม`,
      detailJa: `${playFoodPkg.duration}時間のベイ利用 + お食事とドリンク`,
      detailKo: `${playFoodPkg.duration}시간 베이 이용 + 식사와 음료`,
      detailZh: `${playFoodPkg.duration}小时球位使用 + 餐饮`,
      amount: playFoodPkg.price,
    });
  } else if (packageAppliesToBay && packageChargedHours <= HOUR_EPSILON) {
    // Nothing left to charge — the package pays for the whole booking. Reached
    // by an eligible package with no balance information (the pre-existing
    // `packageCoversThisSlot` case) and by a balance that exactly covers it.
    lineItems.push({
      id: 'bay-rate',
      label: BAY_RATE_LABEL.en,
      labelTh: BAY_RATE_LABEL.th,
      labelJa: BAY_RATE_LABEL.ja,
      labelKo: BAY_RATE_LABEL.ko,
      labelZh: BAY_RATE_LABEL.zh,
      detail: buildBayRateDetail('en', baySegments, isWeekend, startHour),
      detailTh: buildBayRateDetail('th', baySegments, isWeekend, startHour),
      detailJa: buildBayRateDetail('ja', baySegments, isWeekend, startHour),
      detailKo: buildBayRateDetail('ko', baySegments, isWeekend, startHour),
      detailZh: buildBayRateDetail('zh', baySegments, isWeekend, startHour),
      amount: 0,
      isCoveredByPackage: true,
      packageName: packageDisplayName,
      originalAmount: bayCost,
    });
    // NO coverage note here, deliberately. `isCoveredByPackage` above already
    // renders a green "Covered by <package>" chip directly beneath this line
    // item, in BOTH surfaces that render notes — `RailLineItem` in
    // `SummaryRail.tsx` and the line-item loop in `ProjectedCostBreakdown.tsx`.
    // A note saying "Bay rate covered by <package>" repeats that exact sentence
    // a few lines lower, under the Total, which is what the owner reported
    // (Jul 2026). The chip wins because it sits next to the line it explains.
    //
    // The PARTIAL-coverage branch below is NOT the same case: there the
    // customer is charged for the uncovered tail, no chip explains the charge,
    // and its note is the only thing that does. Do not "restore symmetry" by
    // adding one back here.
  } else if (packageAppliesToBay && packageCoveredHours > HOUR_EPSILON) {
    // The package pays for the HEAD of the booking and the tail is charged.
    // Split at `packageCoveredEnd` — 14:00 for an Early Bird booking crossing
    // the cutoff, or wherever the remaining-hours balance runs out, whichever
    // comes first. The charged tail goes through the same segment machinery as
    // an unpackaged booking, so it prorates across 14:00 and 17:00.
    const coveredSegments = getPricedSegments(startFraction, packageCoveredHours, isWeekend);
    const chargedSegments = getPricedSegments(
      packageCoveredEnd, packageChargedHours, isWeekend,
    );
    const chargedCost = Math.round(segmentsCost(chargedSegments));
    const chargedOriginal = Math.round(segmentsOriginalCost(chargedSegments));

    lineItems.push({
      id: 'bay-rate-covered',
      label: BAY_RATE_LABEL.en,
      labelTh: BAY_RATE_LABEL.th,
      labelJa: BAY_RATE_LABEL.ja,
      labelKo: BAY_RATE_LABEL.ko,
      labelZh: BAY_RATE_LABEL.zh,
      detail: buildBayRateDetail('en', coveredSegments, isWeekend, startHour),
      detailTh: buildBayRateDetail('th', coveredSegments, isWeekend, startHour),
      detailJa: buildBayRateDetail('ja', coveredSegments, isWeekend, startHour),
      detailKo: buildBayRateDetail('ko', coveredSegments, isWeekend, startHour),
      detailZh: buildBayRateDetail('zh', coveredSegments, isWeekend, startHour),
      amount: 0,
      isCoveredByPackage: true,
      packageName: packageDisplayName,
      originalAmount: Math.round(segmentsCost(coveredSegments)),
    });
    lineItems.push({
      id: 'bay-rate',
      label: BAY_RATE_LABEL.en,
      labelTh: BAY_RATE_LABEL.th,
      labelJa: BAY_RATE_LABEL.ja,
      labelKo: BAY_RATE_LABEL.ko,
      labelZh: BAY_RATE_LABEL.zh,
      // Slot label comes from where the CHARGED window starts, which is now
      // `packageCoveredEnd` rather than always the 14:00 cutoff.
      detail: buildBayRateDetail('en', chargedSegments, isWeekend, Math.floor(packageCoveredEnd)),
      detailTh: buildBayRateDetail('th', chargedSegments, isWeekend, Math.floor(packageCoveredEnd)),
      detailJa: buildBayRateDetail('ja', chargedSegments, isWeekend, Math.floor(packageCoveredEnd)),
      detailKo: buildBayRateDetail('ko', chargedSegments, isWeekend, Math.floor(packageCoveredEnd)),
      detailZh: buildBayRateDetail('zh', chargedSegments, isWeekend, Math.floor(packageCoveredEnd)),
      amount: chargedCost,
      originalAmount: chargedOriginal > chargedCost ? chargedOriginal : undefined,
    });

    if (packageRunsShort) {
      // The balance ran out at or before the 14:00 cap, so the cap is not what
      // ends the coverage here — saying "covers until 14:00" would misdescribe
      // a split that happens earlier. The balance note is the accurate one.
      pushShortfallNote();
    } else {
      const pkg = packageDisplayName;
      notes.push(`${pkg ?? 'Your package'} covers until 14:00. Time after 14:00 is charged at the normal rate`);
      notesTh.push(`${pkg ?? 'แพ็กเกจของคุณ'} ครอบคลุมถึง 14:00 เวลาหลัง 14:00 คิดค่าบริการตามอัตราปกติ`);
      notesJa.push(`${pkg ?? 'お客様のパッケージ'}は14:00までが対象です。14:00以降は通常料金となります`);
      notesKo.push(`${pkg ?? '회원님의 패키지'}는 14:00까지만 적용됩니다. 14:00 이후는 정상 요금이 부과됩니다`);
      notesZh.push(`${pkg ?? '您的套餐'}仅涵盖至14:00，14:00之后按正常价格收费`);
    }
  } else {
    const originalTotal = Math.round(segmentsOriginalCost(baySegments));

    lineItems.push({
      id: 'bay-rate',
      label: BAY_RATE_LABEL.en,
      labelTh: BAY_RATE_LABEL.th,
      labelJa: BAY_RATE_LABEL.ja,
      labelKo: BAY_RATE_LABEL.ko,
      labelZh: BAY_RATE_LABEL.zh,
      detail: buildBayRateDetail('en', baySegments, isWeekend, startHour),
      detailTh: buildBayRateDetail('th', baySegments, isWeekend, startHour),
      detailJa: buildBayRateDetail('ja', baySegments, isWeekend, startHour),
      detailKo: buildBayRateDetail('ko', baySegments, isWeekend, startHour),
      detailZh: buildBayRateDetail('zh', baySegments, isWeekend, startHour),
      amount: bayCost,
      originalAmount: originalTotal > bayCost ? originalTotal : undefined,
    });

    // An eligible package with a balance too small to pay for any of the
    // booking — no covered line is worth showing, but the customer still needs
    // to know why their package did not apply.
    if (packageRunsShort) {
      pushShortfallNote();
    }

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
      label: `${CLUB_RENTAL_PREFIX.en}: ${clubName}`,
      labelTh: `${CLUB_RENTAL_PREFIX.th}: ${clubName}`,
      labelJa: `${CLUB_RENTAL_PREFIX.ja}：${clubName}`,
      labelKo: `${CLUB_RENTAL_PREFIX.ko}: ${clubName}`,
      labelZh: `${CLUB_RENTAL_PREFIX.zh}：${clubName}`,
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
      label: `${CLUB_RENTAL_PREFIX.en}: ${STANDARD_SET_LABEL.en}`,
      labelTh: `${CLUB_RENTAL_PREFIX.th}: ${STANDARD_SET_LABEL.th}`,
      labelJa: `${CLUB_RENTAL_PREFIX.ja}：${STANDARD_SET_LABEL.ja}`,
      labelKo: `${CLUB_RENTAL_PREFIX.ko}: ${STANDARD_SET_LABEL.ko}`,
      labelZh: `${CLUB_RENTAL_PREFIX.zh}：${STANDARD_SET_LABEL.zh}`,
      detail: COMPLIMENTARY_LABEL.en,
      detailTh: COMPLIMENTARY_LABEL.th,
      detailJa: COMPLIMENTARY_LABEL.ja,
      detailKo: COMPLIMENTARY_LABEL.ko,
      detailZh: COMPLIMENTARY_LABEL.zh,
      amount: 0,
    });
  }

  // 2b. Gear-up add-ons (e.g. Cabretta glove sale).
  // Resolved from getGearUpItems() so DB-driven price changes flow through;
  // product label itself is brand data and stays untranslated, matching the
  // club-rental treatment above.
  if (addOns) {
    const gearUpItems = getGearUpItems();
    for (const item of gearUpItems) {
      if (!addOns[item.id]) continue;
      lineItems.push({
        id: `addon-${item.id}`,
        label: `${ADD_ON_PREFIX.en}: ${item.name}`,
        labelTh: `${ADD_ON_PREFIX.th}: ${item.name}`,
        labelJa: `${ADD_ON_PREFIX.ja}：${item.name}`,
        labelKo: `${ADD_ON_PREFIX.ko}: ${item.name}`,
        labelZh: `${ADD_ON_PREFIX.zh}：${item.name}`,
        amount: item.price,
      });
    }
  }

  // 3. Calculate subtotal before discounts
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  // 4. Promotions — EVALUATE every eligible offer, then apply only the best one.
  //
  // Owner rule (confirmed 2026-07-25): offers never stack. Before this, the loop
  // pushed a discount for every match, so two eligible `bogo` rows each waived
  // an hour and a ฿1,500 booking previewed at ฿0. Nothing but the shape of the
  // `promotions` table (one machine-readable row) was preventing that.
  //
  // The loop below is therefore pure: it builds candidates and touches neither
  // `discounts` nor the notes arrays. Committing happens once, after selection.
  // Eligibility guards (`new_customer_only`, package coverage, Play & Food) are
  // unchanged and still decide whether a promotion becomes a candidate at all.
  const promotionCandidates: PromotionCandidate[] = [];

  for (const promo of applicablePromotions) {
    // Hoisted out of the per-type branches it used to be duplicated in — the
    // types are mutually exclusive, so this is the same gate as before.
    const isNewCustomerOnly = promo.conditions?.new_customer_only === true;
    if (isNewCustomerOnly && !isNewCustomer) continue;

    const candidateNotes = emptyLocalizedNotes();

    // BOGO: 2+ hours → discount applied now; 1 hour → hint to book longer next time for free hour
    if (promo.promotion_type === 'bogo' && promo.free_hours) {
      if (packageAppliesToBay || playFoodPkg) continue;

      if (duration >= 2) {
        // Apply free hour discount to current booking. The free hour(s) are
        // the LAST of the block (customer plays the bonus time at the end),
        // prorated across rate boundaries like the bay charge itself.
        const freeHours = Math.min(promo.free_hours, duration - 1);
        const freeSegments = getPricedSegments(
          startFraction + duration - freeHours,
          freeHours,
          isWeekend,
        );
        const discountAmount = Math.round(segmentsCost(freeSegments));
        if (discountAmount > 0) {
          promotionCandidates.push({
            promotionId: promo.id,
            value: discountAmount,
            discount: {
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
            },
            notes: candidateNotes,
            titleEn: promo.title_en,
            titleTh: promo.title_th,
          });
        }
        // A free window that prices to ฿0 saves the customer nothing, so there
        // is no candidate to push. It is invisible at the disclosure for the
        // same reason the sub-2-hour bogo below is: see the `value > 0` filter
        // on `alsoConsidered` — an offer worth ฿0 never competed for anything.
      } else {
        candidateNotes.en.push(`🎉 ${promo.title_en}: Book 2 hours to get 1 hour free! Or redeem your free hour within 7 days`);
        candidateNotes.th.push(`🎉 ${promo.title_th}: จอง 2 ชม. เพื่อรับฟรี 1 ชม.! หรือใช้สิทธิ์ฟรีภายใน 7 วัน`);
        candidateNotes.ja.push(`🎉 ${promo.title_en}：2時間ご予約で1時間無料！または7日以内に無料時間をご利用ください`);
        candidateNotes.ko.push(`🎉 ${promo.title_en}: 2시간 예약 시 1시간 무료! 또는 7일 이내에 무료 시간을 사용하세요`);
        candidateNotes.zh.push(`🎉 ${promo.title_en}：预订2小时即获1小时免费！或在7天内兑换您的免费时段`);

        // The free hour waives the BAY charge only — a paid club set is
        // billed on total play time. Disclose it so the venue charge
        // (e.g. 2h club tier after redeeming the free hour in-session)
        // doesn't surprise the customer.
        if (clubRentalId && clubRentalId !== 'none' && clubRentalId !== 'standard') {
          candidateNotes.en.push('Club rental is charged on total play time, including the free hour');
          candidateNotes.th.push('ค่าเช่าไม้กอล์ฟคิดตามเวลาเล่นจริงทั้งหมด รวมชั่วโมงฟรีด้วย');
          candidateNotes.ja.push('クラブレンタル料金は無料時間を含む総プレー時間に対して発生します');
          candidateNotes.ko.push('클럽 렌탈 요금은 무료 시간을 포함한 총 플레이 시간 기준으로 청구됩니다');
          candidateNotes.zh.push('球杆租赁费用按总打球时间计算（包含免费时段）');
        }

        // Worth ฿0 today — this offer only advises booking longer. It stays a
        // candidate so a LONE sub-2-hour bogo still prints its hint, but a value
        // of 0 means it can never out-rank an offer that actually saves money —
        // nor be named as one that lost, which it never was.
        promotionCandidates.push({
          promotionId: promo.id,
          value: 0,
          discount: null,
          notes: candidateNotes,
          titleEn: promo.title_en,
          titleTh: promo.title_th,
        });
      }
    } else if (promo.promotion_type === 'percentage' && promo.discount_value && promo.applies_to === 'bay_rate') {
      // Percentage discount on bay rate
      if (packageAppliesToBay || playFoodPkg) continue;

      const bayItem = lineItems.find(item => item.id === 'bay-rate');
      if (bayItem) {
        const discountAmount = Math.round(bayItem.amount * (promo.discount_value / 100));
        if (discountAmount > 0) {
          const pct = promo.discount_value;
          promotionCandidates.push({
            promotionId: promo.id,
            value: discountAmount,
            discount: {
              id: `promo-${promo.id}`,
              label: `${promo.title_en} (${pct}% off)`,
              labelTh: `${promo.title_th} (ลด ${pct}%)`,
              labelJa: `${promo.title_en} (${pct}%オフ)`,
              labelKo: `${promo.title_en} (${pct}% 할인)`,
              labelZh: `${promo.title_en} (${pct}% 折扣)`,
              amount: -discountAmount,
              promotionId: promo.id,
            },
            notes: candidateNotes,
            titleEn: promo.title_en,
            titleTh: promo.title_th,
          });
        }
      }
    } else if (promo.promotion_type === 'fixed_amount' && promo.discount_value) {
      // Fixed amount discount
      if (promo.applies_to === 'bay_rate' && (packageAppliesToBay || playFoodPkg)) continue;

      // `value` is what the customer SAVES, so a (nonsensical) negative
      // `discount_value` ranks as the surcharge it is and loses to anything
      // else. Kept as a candidate rather than filtered out so a lone such row
      // still produces exactly the row the old loop pushed.
      promotionCandidates.push({
        promotionId: promo.id,
        value: promo.discount_value,
        discount: {
          id: `promo-${promo.id}`,
          label: promo.title_en,
          labelTh: promo.title_th,
          labelJa: promo.title_en,
          labelKo: promo.title_en,
          labelZh: promo.title_en,
          amount: -promo.discount_value,
          promotionId: promo.id,
        },
        notes: candidateNotes,
        titleEn: promo.title_en,
        titleTh: promo.title_th,
      });
    }
  }

  // 4b. SELECT the single best candidate, then APPLY only that one.
  //
  // Ranked on value alone, so the offer TYPE never decides — a ฿300 percentage
  // beats a ฿200 bogo and vice versa. Ties break on the LOWEST promotion id:
  // ids are unique per row, which makes the order total and the winner
  // reproducible. Deliberately NOT array position — `applicablePromotions`
  // arrives from `/api/promotions/applicable`, which has no ORDER BY and is
  // edge-cached, so two customers can be served the same offers in two orders.
  //
  // Selection is a pure function of the candidate SET, so the phone-aware
  // `isNewCustomer` refetch can only add or remove whole candidates; it can
  // never reshuffle the winner within an unchanged set.
  //
  // A promotion row cannot legitimately appear twice — `id` is the primary key
  // — but a re-render that appends rather than replaces, or two merged fetches,
  // could duplicate one. Left in, the duplicate gets named back at the customer
  // as an offer that "was also considered" against itself. Collapse on id first,
  // keeping the best entry; genuine duplicates are interchangeable, so the
  // result does not depend on which copy arrived first.
  const bestCandidateById = new Map<string, PromotionCandidate>();
  for (const candidate of promotionCandidates) {
    const seen = bestCandidateById.get(candidate.promotionId);
    if (!seen || candidate.value > seen.value) bestCandidateById.set(candidate.promotionId, candidate);
  }
  const uniqueCandidates = [...bestCandidateById.values()];

  const winner = uniqueCandidates.reduce<PromotionCandidate | null>((best, candidate) => {
    if (!best) return candidate;
    if (candidate.value > best.value) return candidate;
    if (candidate.value === best.value && candidate.promotionId < best.promotionId) return candidate;
    return best;
  }, null);

  if (winner) {
    if (winner.discount) discounts.push(winner.discount);
    notes.push(...winner.notes.en);
    notesTh.push(...winner.notes.th);
    notesJa.push(...winner.notes.ja);
    notesKo.push(...winner.notes.ko);
    notesZh.push(...winner.notes.zh);

    // Only the WINNER's notes are pushed. A losing sub-2-hour bogo's "book 2
    // hours to get 1 hour free" hint is deliberately suppressed: because offers
    // do not stack, at 2 hours that offer would merely compete with the one
    // already applied and could still lose, so the hint would be a promise we
    // cannot keep. Restoring the hint was considered and rejected on exactly
    // that ground (owner decision, 2026-07-25) — honest silence beats a nudge we
    // might not honour. Do not re-litigate it without re-opening the promise.
    //
    // Disclosed ONLY when the winner actually applied a discount. When the best
    // candidate is advice-only (a sub-2-hour bogo), every other candidate is
    // worth ≤ ฿0 too, so nothing was applied — and "we applied the one worth
    // the most" next to a ฿0 saving is a claim the breakdown contradicts.
    //
    // `value > 0` because "also considered" has to mean an offer that could
    // GENUINELY have applied and lost. A ฿0 candidate — the sub-2-hour bogo, or
    // a nonsensical negative `fixed_amount` — never competed for anything, and
    // naming it frames advice as a competition it lost: at a 1-hour booking the
    // customer would read "we applied the one worth the most. Also considered:
    // Buy 1 Get 1 Free" about an offer that could not have applied at 1 hour.
    // This is the same reason the ฿0 free window above is not even a candidate;
    // both zero-value paths end up equally invisible here.
    //
    // Sorted on the SAME key as the selection, because a `filter` would inherit
    // the arrival order the comment above explains we cannot trust — with three
    // eligible offers the sentence itself would otherwise vary between users.
    // Compared with `<` rather than `localeCompare`, which is collation- and
    // ICU-dependent: this list has to read the same for every customer.
    const alsoConsidered = winner.discount
      ? uniqueCandidates
        .filter((candidate) => candidate !== winner && candidate.value > 0)
        .sort((a, b) => b.value - a.value || (a.promotionId < b.promotionId ? -1 : a.promotionId > b.promotionId ? 1 : 0))
      : [];
    if (alsoConsidered.length > 0) {
      const list = (lang: Lang) =>
        alsoConsidered
          .map((candidate) => (lang === 'th' ? candidate.titleTh : candidate.titleEn))
          .join(OFFER_LIST_SEPARATOR[lang]);
      notes.push(BEST_OFFER_ONLY_NOTE.en(list('en')));
      notesTh.push(BEST_OFFER_ONLY_NOTE.th(list('th')));
      notesJa.push(BEST_OFFER_ONLY_NOTE.ja(list('ja')));
      notesKo.push(BEST_OFFER_ONLY_NOTE.ko(list('ko')));
      notesZh.push(BEST_OFFER_ONLY_NOTE.zh(list('zh')));
    }
  }

  const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);
  const estimatedTotal = Math.max(0, subtotal + totalDiscount);

  return {
    lineItems,
    discounts,
    // Left `undefined` rather than `null` when nothing won, so a breakdown with
    // no eligible offer stays `toEqual`-identical to one produced before this
    // field existed. Nothing renders it.
    appliedPromotionId: winner?.promotionId,
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
