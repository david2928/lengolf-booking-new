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
