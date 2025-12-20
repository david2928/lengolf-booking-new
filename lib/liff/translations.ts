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
    weekend: 'วันสุดสัปดาห์',
    perHour: '/ชม.',
    promo: 'โปรโมชั่น',
    operatingHours: 'เวลาเปิด-ปิด',
    amenities: 'สิ่งอำนวยความสะดวก',
    bookNow: 'จองเลย',
    currentRate: 'ราคาเวลาตอนนี้',
    currentlyOpen: 'ว่างอยู่',
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

// Coaching Page Translations
export interface CoachingTranslations {
  title: string;
  subtitle: string;
  ourCoaches: string;
  specialties: string;
  career: string;
  education: string;
  certifications: string;
  viewAvailability: string;
  pricing: string;
  lessonPackages: string;
  specialPackages: string;
  availability: string;
  noAvailability: string;
  perHour: string;
  golfer: string;
  golfers: string;
  golfers3to5: string;
  validity: string;
  bookViaLine: string;
  bookNow: string;
  packageIncludes: string;
  today: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  loadingAvailability: string;
}

export const coachingTranslations: Record<Language, CoachingTranslations> = {
  en: {
    title: 'LENGOLF Coaching',
    subtitle: 'Expert golf coaching with certified PGA professionals',
    ourCoaches: 'Our Coaches',
    specialties: 'Specialties',
    career: 'Career Highlights',
    education: 'Education',
    certifications: 'Certifications',
    viewAvailability: 'View Availability',
    pricing: 'Lesson Pricing',
    lessonPackages: 'Lesson Packages',
    specialPackages: 'Special Packages',
    availability: 'Coach Availability',
    noAvailability: 'No available slots',
    perHour: '/hour',
    golfer: 'Golfer',
    golfers: 'Golfers',
    golfers3to5: '3-5 Golfers',
    validity: 'Validity',
    bookViaLine: 'Book Now via LINE',
    bookNow: 'Book Now',
    packageIncludes: "What's Included",
    today: 'Today',
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
    loadingAvailability: 'Loading availability...',
  },
  th: {
    title: 'LENGOLF โค้ชชิ่ง',
    subtitle: 'โค้ชกอล์ฟมืออาชีพรับรองโดย PGA',
    ourCoaches: 'ทีมโค้ช',
    specialties: 'ความเชี่ยวชาญ',
    career: 'ผลงาน',
    education: 'การศึกษา',
    certifications: 'ใบรับรอง',
    viewAvailability: 'ดูตารางว่าง',
    pricing: 'ราคาบทเรียน',
    lessonPackages: 'แพ็คเกจบทเรียน',
    specialPackages: 'แพ็คเกจพิเศษ',
    availability: 'ตารางว่างโค้ช',
    noAvailability: 'ไม่มีช่วงว่าง',
    perHour: '/ชม.',
    golfer: 'นักกอล์ฟ',
    golfers: 'นักกอล์ฟ',
    golfers3to5: '3-5 คน',
    validity: 'ระยะเวลา',
    bookViaLine: 'จองผ่าน LINE',
    bookNow: 'จองเลย',
    packageIncludes: 'รวมในแพ็คเกจ',
    today: 'วันนี้',
    monday: 'จ.',
    tuesday: 'อ.',
    wednesday: 'พ.',
    thursday: 'พฤ.',
    friday: 'ศ.',
    saturday: 'ส.',
    sunday: 'อา.',
    loadingAvailability: 'กำลังโหลดตารางว่าง...',
  },
};
