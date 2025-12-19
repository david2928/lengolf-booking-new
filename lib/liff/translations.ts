export type Language = 'en' | 'th';

export interface ContactTranslations {
  title: string;
  callUs: string;
  callNow: string;
  emailUs: string;
  sendEmail: string;
  location: string;
  address: string;
  getDirections: string;
  gettingHere: string;
  btsTitle: string;
  btsDirections: string;
  parkingTitle: string;
  parkingRate: string;
  parkingWeekday: string;
  parkingWeekend: string;
  parkingTier1: string;
  parkingTier2: string;
  parkingTier3: string;
  parkingNote: string;
  hours: string;
  daily: string;
  currentlyOpen: string;
  currentlyClosed: string;
  followUs: string;
  website: string;
  visitWebsite: string;
}

export const translations: Record<Language, ContactTranslations> = {
  en: {
    title: 'Contact Us',
    callUs: 'Call Us',
    callNow: 'Call Now',
    emailUs: 'Email Us',
    sendEmail: 'Send Email',
    location: 'Our Location',
    address: 'The Mercury Ville @ BTS Chidlom\nFloor 4, Bangkok 10330',
    getDirections: 'Get Directions',
    gettingHere: 'Getting Here',
    btsTitle: 'BTS Chidlom',
    btsDirections: 'Exit 4 - Walk via skywalk to Mercury Ville',
    parkingTitle: 'Parking',
    parkingRate: 'Free parking with every booking',
    parkingWeekday: '',
    parkingWeekend: '',
    parkingTier1: '',
    parkingTier2: '',
    parkingTier3: '',
    parkingNote: '',
    hours: 'Opening Hours',
    daily: 'Daily',
    currentlyOpen: 'Currently Open',
    currentlyClosed: 'Currently Closed',
    followUs: 'Follow Us',
    website: 'Website',
    visitWebsite: 'Visit Website',
  },
  th: {
    title: 'ติดต่อเรา',
    callUs: 'โทรหาเรา',
    callNow: 'โทรเลย',
    emailUs: 'อีเมล',
    sendEmail: 'ส่งอีเมล',
    location: 'ที่ตั้ง',
    address: 'The Mercury Ville @ BTS ชิดลม\nชั้น 4, กรุงเทพฯ 10330',
    getDirections: 'นำทาง',
    gettingHere: 'การเดินทาง',
    btsTitle: 'BTS ชิดลม',
    btsDirections: 'ทางออก 4 - เดินผ่านสกายวอล์คไปยัง Mercury Ville',
    parkingTitle: 'ที่จอดรถ',
    parkingRate: 'ฟรีทุกการจอง',
    parkingWeekday: '',
    parkingWeekend: '',
    parkingTier1: '',
    parkingTier2: '',
    parkingTier3: '',
    parkingNote: '',
    hours: 'เวลาเปิด-ปิด',
    daily: 'ทุกวัน',
    currentlyOpen: 'เปิดอยู่',
    currentlyClosed: 'ปิดแล้ว',
    followUs: 'ติดตามเรา',
    website: 'เว็บไซต์',
    visitWebsite: 'เยี่ยมชมเว็บไซต์',
  },
};

// Promotions Page Translations
export interface PromotionTranslations {
  title: string;
  tapToAdvance: string;
  holdToPause: string;
  expiresIn: string;
  days: string;
  hours: string;
  minutes: string;
  bookNow: string;
  sharePromotion: string;
  contactUs: string;
  learnMore: string;
  of: string;
  loading: string;
}

export const promotionTranslations: Record<Language, PromotionTranslations> = {
  en: {
    title: 'Promotions',
    tapToAdvance: 'Tap to advance',
    holdToPause: 'Hold to pause',
    expiresIn: 'Expires in',
    days: 'days',
    hours: 'hours',
    minutes: 'minutes',
    bookNow: 'Book Now',
    sharePromotion: 'Share',
    contactUs: 'Contact Us',
    learnMore: 'Learn More',
    of: 'of',
    loading: 'Loading...',
  },
  th: {
    title: 'โปรโมชั่น',
    tapToAdvance: 'แตะเพื่อดูต่อ',
    holdToPause: 'กดค้างเพื่อหยุดชั่วคราว',
    expiresIn: 'หมดเขตใน',
    days: 'วัน',
    hours: 'ชั่วโมง',
    minutes: 'นาที',
    bookNow: 'จองเลย',
    sharePromotion: 'แชร์',
    contactUs: 'ติดต่อเรา',
    learnMore: 'เรียนรู้เพิ่มเติม',
    of: 'จาก',
    loading: 'กำลังโหลด...',
  },
};

// Bay Rates Page Translations
export interface BayRatesTranslations {
  title: string;
  time: string;
  weekday: string;
  weekend: string;
  perHour: string;
  promo: string;
  operatingHours: string;
  amenities: string;
  bookNow: string;
  currentRate: string;
  currentlyOpen: string;
  currentlyClosed: string;
  free: string;
  available: string;
  forPurchase: string;
  quickLinks: string;
  premiumClub: string;
  foodMenu: string;
  drinkMenu: string;
  viewPromotions: string;
  contactUs: string;
}

export const bayRatesTranslations: Record<Language, BayRatesTranslations> = {
  en: {
    title: 'Bay Rates',
    time: 'Time',
    weekday: 'Weekday',
    weekend: 'Weekend',
    perHour: '/hour',
    promo: 'PROMO',
    operatingHours: 'Operating Hours',
    amenities: 'Amenities',
    bookNow: 'Book Now',
    currentRate: 'Current Rate',
    currentlyOpen: 'Currently Open',
    currentlyClosed: 'Currently Closed',
    free: 'Free',
    available: 'Available',
    forPurchase: 'For Purchase',
    quickLinks: 'More Options',
    premiumClub: 'Premium Club Rental',
    foodMenu: 'Food Menu',
    drinkMenu: 'Drink Menu',
    viewPromotions: 'Promotions',
    contactUs: 'Contact Us',
  },
  th: {
    title: 'ราคาเบย์',
    time: 'เวลา',
    weekday: 'วันธรรมดา',
    weekend: 'วันหยุด',
    perHour: '/ชม.',
    promo: 'โปรโมชั่น',
    operatingHours: 'เวลาเปิด-ปิด',
    amenities: 'สิ่งอำนวยความสะดวก',
    bookNow: 'จองเลย',
    currentRate: 'ราคาปัจจุบัน',
    currentlyOpen: 'เปิดอยู่',
    currentlyClosed: 'ปิดแล้ว',
    free: 'ฟรี',
    available: 'มีบริการ',
    forPurchase: 'มีจำหน่าย',
    quickLinks: 'ตัวเลือกเพิ่มเติม',
    premiumClub: 'เช่าไม้พรีเมียม',
    foodMenu: 'เมนูอาหาร',
    drinkMenu: 'เมนูเครื่องดื่ม',
    viewPromotions: 'โปรโมชั่น',
    contactUs: 'ติดต่อเรา',
  },
};
