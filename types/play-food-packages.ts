import { getCachedPricing, findPrice } from '@/lib/pricing';

export interface FoodItem {
  name: string;
  quantity: number;
}

export interface DrinkItem {
  name: string;
  type: 'unlimited' | 'per_person';
  quantity?: number;
}

export interface PlayFoodPackage {
  id: 'SET_A' | 'SET_B' | 'SET_C';
  name: string;
  displayName: string;
  price: number;
  pricePerPerson: number;
  duration: number;
  maxPeople: 5;
  foodItems: FoodItem[];
  drinks: DrinkItem[];
  isPopular?: boolean;
  badge?: string;
}

const DEFAULT_PLAY_FOOD_PACKAGES: PlayFoodPackage[] = [
  {
    id: 'SET_A',
    name: 'SET A',
    displayName: 'Entry Level',
    price: 1200,
    pricePerPerson: 240,
    duration: 1,
    maxPeople: 5,
    foodItems: [
      { name: 'Chicken Sliders', quantity: 1 },
      { name: 'French Fries', quantity: 1 }
    ],
    drinks: [
      { name: 'Soft Drinks', type: 'unlimited' }
    ],
    badge: 'Great Value'
  },
  {
    id: 'SET_B',
    name: 'SET B',
    displayName: 'Standard',
    price: 2100,
    pricePerPerson: 420,
    duration: 2,
    maxPeople: 5,
    foodItems: [
      { name: 'Chicken Sliders', quantity: 1 },
      { name: 'Pulled Pork Sandwich', quantity: 1 },
      { name: 'French Fries', quantity: 1 }
    ],
    drinks: [
      { name: 'Soft Drinks', type: 'unlimited' }
    ],
    isPopular: true,
    badge: 'Most Popular'
  },
  {
    id: 'SET_C',
    name: 'SET C',
    displayName: 'Premium',
    price: 2975,
    pricePerPerson: 595,
    duration: 3,
    maxPeople: 5,
    foodItems: [
      { name: 'BBQ Brisket Slider', quantity: 1 },
      { name: 'Pulled Pork Sandwich', quantity: 1 },
      { name: 'Calamari', quantity: 1 },
      { name: 'French Fries', quantity: 1 }
    ],
    drinks: [
      { name: 'Soft Drinks', type: 'unlimited' },
      { name: 'Beer / Cocktail / Wine', type: 'per_person', quantity: 1 }
    ],
    badge: 'Premium Experience'
  }
];

/** @deprecated Use getPlayFoodPackages() for dynamic pricing */
export const PLAY_FOOD_PACKAGES: PlayFoodPackage[] = DEFAULT_PLAY_FOOD_PACKAGES;

/**
 * Get Play & Food packages with dynamic API prices when available.
 */
export function getPlayFoodPackages(): PlayFoodPackage[] {
  const pricing = getCachedPricing();
  if (!pricing) return DEFAULT_PLAY_FOOD_PACKAGES;

  const { mixedPackages } = pricing;
  const setMap: Record<string, RegExp> = {
    SET_A: /food\s*&?\s*play.*set\s*a/i,
    SET_B: /food\s*&?\s*play.*set\s*b/i,
    SET_C: /food\s*&?\s*play.*set\s*c/i,
  };

  return DEFAULT_PLAY_FOOD_PACKAGES.map((pkg) => {
    const pattern = setMap[pkg.id];
    if (!pattern) return pkg;
    const apiPrice = findPrice(mixedPackages, pattern, pkg.price);
    return {
      ...pkg,
      price: apiPrice,
      pricePerPerson: Math.round(apiPrice / pkg.maxPeople),
    };
  });
}

export function getPackageById(id: string): PlayFoodPackage | null {
  return getPlayFoodPackages().find(pkg => pkg.id === id) || null;
}

export function isValidPackageId(id: string): id is 'SET_A' | 'SET_B' | 'SET_C' {
  return (['SET_A', 'SET_B', 'SET_C'] as string[]).includes(id);
}