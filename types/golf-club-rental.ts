export interface GolfClubOption {
  id: 'premium-mens' | 'premium-ladies' | 'standard' | 'none';
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
    id: 'premium-mens',
    name: "Premium Set",
    displayName: "Professional Clubs",
    description: "Premium golf clubs with professional specifications",
    brand: "Premium",
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
    id: 'premium-ladies',
    name: "Women's Premium Set",
    displayName: "Majesty Shuttle",
    description: "2023 Majesty Shuttle with ladies flex shafts",
    brand: "Majesty",
    specifications: [
      "12.5° Driver",
      "Irons 7-9",
      "Pitching Wedge (PW)",
      "56° Puppy's Paw SW",
      "Premium ladies golf bag"
    ],
    pricePerHour: 150,
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
    pricePerHour: 100,
    available: true
  }
];

export const GOLF_CLUB_PRICING: GolfClubPricing[] = [
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
  },
  {
    duration: 24,
    unit: 'day',
    price: 1200,
    displayText: 'Full day (24h)'
  }
];

export function getClubById(id: string): GolfClubOption | null {
  return GOLF_CLUB_OPTIONS.find(club => club.id === id) || null;
}

export function formatClubRentalInfo(clubId: string): string | null {
  const club = getClubById(clubId);
  if (!club || clubId === 'none') return null;
  
  return `Golf Club Rental: ${club.name}`;
}