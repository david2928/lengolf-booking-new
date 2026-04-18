import { getCachedPricing, findPrice } from '@/lib/pricing';

export interface GearUpItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  image: string;
}

const DEFAULT_GEAR_UP_ITEMS: GearUpItem[] = [
  { id: 'gloves', name: 'Premium Leather Gloves', price: 600, image: '/images/gear-up/gloves.png' },
  { id: 'balls', name: 'Golf Balls (6-pack)', price: 400, image: '/images/gear-up/balls.png' },
  { id: 'delivery', name: 'Delivery Service', price: 500, description: 'pick-up + return (within Bangkok)', image: '/images/gear-up/delivery.png' },
];

/** @deprecated Use getGearUpItems() for dynamic pricing */
export const GEAR_UP_ITEMS: GearUpItem[] = DEFAULT_GEAR_UP_ITEMS;

/** Get gear-up add-on items with dynamic API prices when available. */
export function getGearUpItems(): GearUpItem[] {
  const pricing = getCachedPricing();
  if (!pricing) return DEFAULT_GEAR_UP_ITEMS;

  const { clubRental } = pricing;
  return DEFAULT_GEAR_UP_ITEMS.map((item) => {
    if (item.id === 'gloves') return { ...item, price: findPrice(clubRental.addons, /glove/i, item.price) };
    if (item.id === 'balls') return { ...item, price: findPrice(clubRental.addons, /ball/i, item.price) };
    if (item.id === 'delivery') return { ...item, price: findPrice(clubRental.addons, /delivery/i, item.price) };
    return item;
  });
}

export interface GolfClubOption {
  id: 'premium' | 'premium-plus' | 'standard' | 'none';
  name: string;
  displayName: string;
  description: string;
  brand?: string;
  specifications: string[];
  pricePerHour: number;
  image?: string;
  available: boolean;
}

export interface GolfClubPricing {
  duration: number;
  unit: 'hour' | 'hours' | 'day';
  price: number;
  displayText: string;
}

export const GOLF_CLUB_OPTIONS: GolfClubOption[] = [
  {
    id: 'premium',
    name: "Premium Set",
    displayName: "Callaway Warbird / Majesty Shuttle",
    description: "Premium golf clubs with professional specifications",
    brand: "Callaway / Majesty",
    specifications: [
      "Driver",
      "5-wood",
      "Irons 5-9",
      "Pitching Wedge (PW)",
      "Sand Wedge (SW)",
      "Premium golf bag"
    ],
    pricePerHour: 150,
    available: true
  },
  {
    id: 'premium-plus',
    name: "Premium+ Set",
    displayName: "Callaway Paradym",
    description: "Top-tier Callaway Paradym clubs for the ultimate experience",
    brand: "Callaway",
    specifications: [
      "Paradym Driver",
      "Paradym Fairway Wood",
      "Paradym Irons 5-9",
      "Pitching Wedge (PW)",
      "Sand Wedge (SW)",
      "Premium Callaway bag"
    ],
    pricePerHour: 250,
    available: true
  },
  {
    id: 'standard',
    name: "Standard Set",
    displayName: "Regular Rental Clubs",
    description: "Quality rental clubs suitable for all skill levels",
    specifications: [
      "Full set of clubs",
      "Standard golf bag",
      "Suitable for beginners to intermediate"
    ],
    pricePerHour: 0,
    available: true
  }
];

const DEFAULT_PREMIUM_CLUB_PRICING: GolfClubPricing[] = [
  { duration: 1, unit: 'hour', price: 150, displayText: '1 hour' },
  { duration: 2, unit: 'hours', price: 250, displayText: '2 hours' },
  { duration: 3, unit: 'hours', price: 350, displayText: '3 hours' },
  { duration: 4, unit: 'hours', price: 400, displayText: '4 hours' },
  { duration: 5, unit: 'hours', price: 450, displayText: '5 hours' },
];

const DEFAULT_PREMIUM_PLUS_CLUB_PRICING: GolfClubPricing[] = [
  { duration: 1, unit: 'hour', price: 250, displayText: '1 hour' },
  { duration: 2, unit: 'hours', price: 450, displayText: '2 hours' },
  { duration: 3, unit: 'hours', price: 650, displayText: '3 hours' },
  { duration: 4, unit: 'hours', price: 800, displayText: '4 hours' },
  { duration: 5, unit: 'hours', price: 950, displayText: '5 hours' },
];

/** @deprecated Use getPremiumClubPricing() for dynamic pricing */
export const PREMIUM_CLUB_PRICING: GolfClubPricing[] = DEFAULT_PREMIUM_CLUB_PRICING;
/** @deprecated Use getPremiumPlusClubPricing() for dynamic pricing */
export const PREMIUM_PLUS_CLUB_PRICING: GolfClubPricing[] = DEFAULT_PREMIUM_PLUS_CLUB_PRICING;

/** @deprecated Use PREMIUM_CLUB_PRICING instead */
export const GOLF_CLUB_PRICING = PREMIUM_CLUB_PRICING;

/** Build dynamic club pricing from API modifiers */
function buildDynamicClubPricing(
  productPattern: RegExp,
  defaults: GolfClubPricing[]
): GolfClubPricing[] {
  const pricing = getCachedPricing();
  if (!pricing) return defaults;

  const product = pricing.clubRental.indoor.find((p) => productPattern.test(p.name));
  if (!product?.modifiers?.length) return defaults;

  return defaults.map((tier) => {
    const hourLabel = tier.duration === 1 ? /1\s*hour/i : new RegExp(`${tier.duration}\\s*hour`, 'i');
    const modifier = product.modifiers!.find((m) => hourLabel.test(m.name));
    return modifier ? { ...tier, price: modifier.price } : tier;
  });
}

/** Get Premium club pricing with dynamic API prices. */
export function getPremiumClubPricing(): GolfClubPricing[] {
  return buildDynamicClubPricing(/premium(?!\+|\s*\+)\s*indoor/i, DEFAULT_PREMIUM_CLUB_PRICING);
}

/** Get Premium+ club pricing with dynamic API prices. */
export function getPremiumPlusClubPricing(): GolfClubPricing[] {
  return buildDynamicClubPricing(/premium\+\s*indoor/i, DEFAULT_PREMIUM_PLUS_CLUB_PRICING);
}

export function getClubPricing(clubId: string): GolfClubPricing[] {
  if (clubId === 'premium-plus') return getPremiumPlusClubPricing();
  if (clubId === 'premium') return getPremiumClubPricing();
  return [];
}

export function getClubById(id: string): GolfClubOption | null {
  return GOLF_CLUB_OPTIONS.find(club => club.id === id) || null;
}

export function formatClubRentalInfo(clubId: string): string | null {
  const club = getClubById(clubId);
  if (!club || clubId === 'none') return null;

  return `Golf Club Rental: ${club.name}`;
}

/**
 * Thumbnail URL for a rental set (tier + gender -> hero photo in Supabase storage).
 * Used by the booking flow selector, the club rental modal, and the /course-rental preview.
 * Falls back to the empty string if no mapping exists - callers should check before rendering.
 */
const CLUB_IMAGE_BASE = 'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/website-assets/clubs';

export function getSetThumbnailUrl(set: { tier: string; gender: string }): string {
  if (set.tier === 'premium-plus') return `${CLUB_IMAGE_BASE}/premium-plus/2.png`;
  if (set.tier === 'premium' && set.gender === 'mens') return `${CLUB_IMAGE_BASE}/warbird/warbird-full-set.webp`;
  if (set.tier === 'premium' && set.gender === 'womens') return `${CLUB_IMAGE_BASE}/premium-womens/majesty-shuttle-full-set.jpg`;
  return '';
}

// --- New DB-backed types for club rental booking system ---

/** A bookable club set from the rental_club_sets table */
export interface RentalClubSet {
  id: string;
  name: string;
  slug: string;
  tier: 'premium' | 'premium-plus';
  gender: 'mens' | 'womens';
  brand: string | null;
  model: string | null;
  description: string | null;
  specifications: string[];
  image_url: string | null;
  rental_type: 'indoor' | 'course' | 'both';
  indoor_price_1h: number;
  indoor_price_2h: number;
  indoor_price_3h: number | null;
  indoor_price_4h: number;
  indoor_price_5h: number | null;
  course_price_1d: number;
  course_price_3d: number;
  course_price_7d: number;
  course_price_14d: number;
  quantity: number;
  display_order: number;
}

/** A club set with real-time availability from get_available_club_sets() */
export interface RentalClubSetWithAvailability extends RentalClubSet {
  rented_count: number;
  available_count: number;
}

/** Response from /api/clubs/availability */
export interface ClubAvailabilityResponse {
  sets: RentalClubSetWithAvailability[];
  date: string;
  rental_type: 'indoor' | 'course';
}

/** Club rental add-on item stored in club_rentals.add_ons */
export interface ClubRentalAddOn {
  key: string;
  label: string;
  price: number;
}

/** Request body for /api/clubs/reserve */
export interface ClubReserveRequest {
  rental_club_set_id: string;
  rental_type: 'indoor' | 'course';
  start_date: string;       // YYYY-MM-DD
  end_date?: string;         // YYYY-MM-DD (course only, defaults to start_date for indoor)
  start_time?: string;       // HH:MM (indoor only)
  duration_hours?: number;   // Indoor: 1, 2, 4
  duration_days?: number;    // Course: 1, 3, 7, 14
  booking_id?: string;       // Link to bay booking (indoor only)
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_id?: string;
  user_id?: string;
  add_ons?: ClubRentalAddOn[];
  delivery_requested?: boolean;
  delivery_address?: string;
  delivery_time?: string;
  return_time?: string;
  notes?: string;
  source?: 'website' | 'booking_app' | 'liff' | 'staff' | 'line';
}

/** Get the indoor price for a given duration from a RentalClubSet */
export function getIndoorPrice(set: RentalClubSet, durationHours: number): number {
  if (durationHours <= 1) return Number(set.indoor_price_1h);
  if (durationHours <= 2) return Number(set.indoor_price_2h);
  if (durationHours <= 3) return Number(set.indoor_price_3h || set.indoor_price_4h);
  if (durationHours <= 4) return Number(set.indoor_price_4h);
  return Number(set.indoor_price_5h || set.indoor_price_4h);
}

/** A single pack in a course rental combo breakdown */
export interface CoursePackItem {
  days: number;
  label: string;
  price: number;
}

/** Result of optimal course pricing calculation */
export interface CoursePriceBreakdown {
  total: number;
  packs: CoursePackItem[];
  dailyRate: number;       // price if paying 1-day rate × days
  savings: number;         // dailyRate - total
}

/**
 * Calculate the optimal (cheapest) combination of rental packs for a given number of days.
 * Uses dynamic programming over the available tier prices: 1d, 3d, 7d, 14d.
 * Overpacking is allowed — e.g. 2 days may use a 3-day pack if it's cheaper than 2×1-day.
 * This is intentional: the customer pays less and gets extra coverage.
 */
export function getCoursePriceBreakdown(set: RentalClubSet, durationDays: number): CoursePriceBreakdown {
  const tiers: { days: number; price: number; label: string }[] = [
    { days: 1, price: Number(set.course_price_1d), label: '1-day' },
    { days: 3, price: Number(set.course_price_3d), label: '3-day pack' },
    { days: 7, price: Number(set.course_price_7d), label: '7-day pack' },
    { days: 14, price: Number(set.course_price_14d), label: '14-day pack' },
  ];

  const dayPrice = tiers[0].price;
  const dailyRate = durationDays * dayPrice;

  // dp[i] = minimum cost to cover i days
  const n = durationDays;
  const dp = new Array(n + 1).fill(Infinity);
  const choice = new Array(n + 1).fill(-1);
  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    for (const tier of tiers) {
      const prev = Math.max(0, i - tier.days);
      if (dp[prev] + tier.price < dp[i]) {
        dp[i] = dp[prev] + tier.price;
        choice[i] = tier.days;
      }
    }
  }

  // Reconstruct packs
  const packCounts: Record<number, number> = {};
  let remaining = n;
  while (remaining > 0) {
    const tierDays = choice[remaining];
    packCounts[tierDays] = (packCounts[tierDays] || 0) + 1;
    remaining = Math.max(0, remaining - tierDays);
  }

  const packs: CoursePackItem[] = [];
  // Show larger packs first
  for (const tier of [...tiers].reverse()) {
    const count = packCounts[tier.days] || 0;
    for (let i = 0; i < count; i++) {
      packs.push({ days: tier.days, label: tier.label, price: tier.price });
    }
  }

  return {
    total: dp[n],
    packs,
    dailyRate,
    savings: dailyRate - dp[n],
  };
}

/** Get the optimal course price for a given duration from a RentalClubSet */
export function getCoursePrice(set: RentalClubSet, durationDays: number): number {
  return getCoursePriceBreakdown(set, durationDays).total;
}
