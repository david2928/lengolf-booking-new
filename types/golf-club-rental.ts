export interface GearUpItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  image: string;
}

export const GEAR_UP_ITEMS: GearUpItem[] = [
  { id: 'gloves', name: 'Premium Leather Gloves', price: 600, image: '/images/gear-up/gloves.png' },
  { id: 'balls', name: 'Golf Balls (6-pack)', price: 400, image: '/images/gear-up/balls.png' },
  { id: 'delivery', name: 'Delivery Service', price: 500, description: 'pick-up + return (within Bangkok)', image: '/images/gear-up/delivery.png' },
];

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

export const PREMIUM_CLUB_PRICING: GolfClubPricing[] = [
  {
    duration: 1,
    unit: 'hour',
    price: 150,
    displayText: '1 hour'
  },
  {
    duration: 2,
    unit: 'hours',
    price: 250,
    displayText: '2 hours'
  },
  {
    duration: 4,
    unit: 'hours',
    price: 400,
    displayText: '4 hours'
  }
];

export const PREMIUM_PLUS_CLUB_PRICING: GolfClubPricing[] = [
  {
    duration: 1,
    unit: 'hour',
    price: 250,
    displayText: '1 hour'
  },
  {
    duration: 2,
    unit: 'hours',
    price: 450,
    displayText: '2 hours'
  },
  {
    duration: 4,
    unit: 'hours',
    price: 800,
    displayText: '4 hours'
  }
];

/** @deprecated Use PREMIUM_CLUB_PRICING instead */
export const GOLF_CLUB_PRICING = PREMIUM_CLUB_PRICING;

export function getClubPricing(clubId: string): GolfClubPricing[] {
  if (clubId === 'premium-plus') return PREMIUM_PLUS_CLUB_PRICING;
  if (clubId === 'premium') return PREMIUM_CLUB_PRICING;
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
  indoor_price_4h: number;
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
  notes?: string;
  source?: 'website' | 'booking_app' | 'liff' | 'staff' | 'line';
}

/** Get the indoor price for a given duration from a RentalClubSet */
export function getIndoorPrice(set: RentalClubSet, durationHours: number): number {
  if (durationHours <= 1) return Number(set.indoor_price_1h);
  if (durationHours <= 2) return Number(set.indoor_price_2h);
  if (durationHours <= 4) return Number(set.indoor_price_4h);
  // For durations > 4, use 4h price (staff handles pricing for longer sessions)
  return Number(set.indoor_price_4h);
}

/** Get the course price for a given duration from a RentalClubSet */
export function getCoursePrice(set: RentalClubSet, durationDays: number): number {
  if (durationDays <= 1) return Number(set.course_price_1d);
  if (durationDays <= 3) return Number(set.course_price_3d);
  if (durationDays <= 7) return Number(set.course_price_7d);
  return Number(set.course_price_14d);
}
