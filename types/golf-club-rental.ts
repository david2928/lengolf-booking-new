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
