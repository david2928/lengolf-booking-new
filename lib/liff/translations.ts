export type Language = 'en' | 'th' | 'ja' | 'zh';

export const LANGUAGES: Language[] = ['en', 'th', 'ja', 'zh'];

export const nextLanguage: Record<Language, Language> = {
  en: 'th',
  th: 'ja',
  ja: 'zh',
  zh: 'en',
};

export const languageLabel: Record<Language, string> = {
  en: '🇬🇧',
  th: '🇹🇭',
  ja: '🇯🇵',
  zh: '🇨🇳',
};

export const languageNativeName: Record<Language, string> = {
  en: 'English',
  th: 'ไทย',
  ja: '日本語',
  zh: '中文',
};

export function isValidLanguage(lang: string): lang is Language {
  return lang === 'en' || lang === 'th' || lang === 'ja' || lang === 'zh';
}

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
  ja: {
    title: 'お問い合わせ',
    callUs: 'お電話',
    callNow: '電話する',
    emailUs: 'メール',
    sendEmail: 'メールを送る',
    location: '所在地',
    address: 'The Mercury Ville @ BTS チットロム\n4階、バンコク 10330',
    getDirections: '道順を見る',
    gettingHere: 'アクセス',
    btsTitle: 'BTS チットロム',
    btsDirections: '出口4 - スカイウォークでMercury Villeへ',
    parkingTitle: '駐車場',
    parkingRate: 'ご予約で駐車場無料',
    parkingWeekday: '',
    parkingWeekend: '',
    parkingTier1: '',
    parkingTier2: '',
    parkingTier3: '',
    parkingNote: '',
    hours: '営業時間',
    daily: '毎日',
    currentlyOpen: '営業中',
    currentlyClosed: '営業時間外',
    followUs: 'フォローする',
    website: 'ウェブサイト',
    visitWebsite: 'ウェブサイトを見る',
  },
  zh: {
    title: '联系我们',
    callUs: '致电我们',
    callNow: '立即拨打',
    emailUs: '发送邮件',
    sendEmail: '发送邮件',
    location: '我们的位置',
    address: 'The Mercury Ville @ BTS Chidlom\n4楼, 曼谷 10330',
    getDirections: '获取路线',
    gettingHere: '如何到达',
    btsTitle: 'BTS Chidlom',
    btsDirections: '4号出口 - 经天桥步行至Mercury Ville',
    parkingTitle: '停车场',
    parkingRate: '每次预约均享免费停车',
    parkingWeekday: '',
    parkingWeekend: '',
    parkingTier1: '',
    parkingTier2: '',
    parkingTier3: '',
    parkingNote: '',
    hours: '营业时间',
    daily: '每天',
    currentlyOpen: '营业中',
    currentlyClosed: '已打烊',
    followUs: '关注我们',
    website: '网站',
    visitWebsite: '访问网站',
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
  ja: {
    title: 'プロモーション',
    tapToAdvance: 'タップで次へ',
    holdToPause: '長押しで一時停止',
    expiresIn: '残り',
    days: '日',
    hours: '時間',
    minutes: '分',
    bookNow: '今すぐ予約',
    sharePromotion: 'シェア',
    contactUs: 'お問い合わせ',
    learnMore: '詳しく見る',
    of: '/',
    loading: '読み込み中...',
  },
  zh: {
    title: '优惠活动',
    tapToAdvance: '点击翻页',
    holdToPause: '长按暂停',
    expiresIn: '剩余',
    days: '天',
    hours: '小时',
    minutes: '分钟',
    bookNow: '立即预约',
    sharePromotion: '分享',
    contactUs: '联系我们',
    learnMore: '了解更多',
    of: '/',
    loading: '加载中...',
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
  ja: {
    title: '料金表',
    time: '時間帯',
    weekday: '平日',
    weekend: '週末',
    perHour: '/時間',
    promo: 'プロモ',
    operatingHours: '営業時間',
    amenities: '設備・サービス',
    bookNow: '今すぐ予約',
    currentRate: '現在の料金',
    currentlyOpen: '営業中',
    currentlyClosed: '営業時間外',
    free: '無料',
    available: '利用可能',
    forPurchase: '販売あり',
    quickLinks: 'その他のオプション',
    premiumClub: 'プレミアムクラブレンタル',
    foodMenu: 'フードメニュー',
    drinkMenu: 'ドリンクメニュー',
    viewPromotions: 'プロモーション',
    contactUs: 'お問い合わせ',
  },
  zh: {
    title: '价目表',
    time: '时段',
    weekday: '工作日',
    weekend: '周末',
    perHour: '/小时',
    promo: '优惠',
    operatingHours: '营业时间',
    amenities: '设施服务',
    bookNow: '立即预约',
    currentRate: '当前价格',
    currentlyOpen: '营业中',
    currentlyClosed: '已打烊',
    free: '免费',
    available: '可用',
    forPurchase: '可购买',
    quickLinks: '更多选项',
    premiumClub: '高级球杆租赁',
    foodMenu: '餐饮菜单',
    drinkMenu: '饮品菜单',
    viewPromotions: '优惠活动',
    contactUs: '联系我们',
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
  // Free trial section
  freeTrialTitle: string;
  freeTrialSubtitle: string;
  freeTrialBenefit1: string;
  freeTrialBenefit2: string;
  freeTrialBenefit3: string;
  freeTrialCta: string;
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
    // Free trial section
    freeTrialTitle: 'Free Trial 1 Hour',
    freeTrialSubtitle: 'with our Pro',
    freeTrialBenefit1: 'Easy to understand techniques',
    freeTrialBenefit2: 'Solid fundamentals',
    freeTrialBenefit3: 'Ready for the course',
    freeTrialCta: 'Book Now!!',
  },
  th: {
    title: 'ทีมโค้ช',
    subtitle: 'โค้ชกอล์ฟมืออาชีพรับรองโดย PGA',
    ourCoaches: 'ทีมโปรผู้ฝึกสอน',
    specialties: 'ความเชี่ยวชาญ',
    career: 'ผลงาน',
    education: 'การศึกษา',
    certifications: 'ใบรับรอง',
    viewAvailability: 'ดูตารางการสอน',
    pricing: 'ราคาบทเรียน',
    lessonPackages: 'โปรแกรมการสอน',
    specialPackages: 'โปรแกรมการสอนแบบพิเศษ',
    availability: 'โปรผู้ฝึกสอน',
    noAvailability: 'ไม่มีช่วงว่าง',
    perHour: '/ชม.',
    golfer: 'นักกอล์ฟ',
    golfers: 'นักกอล์ฟ',
    golfers3to5: '3-5 คน',
    validity: 'ระยะเวลา',
    bookViaLine: 'จองผ่าน LINE',
    bookNow: 'จองเลย',
    packageIncludes: 'รวมในโปรแกรมการสอน',
    today: 'วันนี้',
    monday: 'จ.',
    tuesday: 'อ.',
    wednesday: 'พ.',
    thursday: 'พฤ.',
    friday: 'ศ.',
    saturday: 'ส.',
    sunday: 'อา.',
    loadingAvailability: 'กำลังโหลดตารางว่าง...',
    // Free trial section
    freeTrialTitle: 'ทดลองเรียน ฟรี 1 ชั่วโมง',
    freeTrialSubtitle: 'กับโปรของเรา',
    freeTrialBenefit1: 'เทคนิคเข้าใจง่าย',
    freeTrialBenefit2: 'พื้นฐานแน่น',
    freeTrialBenefit3: 'พร้อมลุยสนาม',
    freeTrialCta: 'จองเลย!!',
  },
  ja: {
    title: 'LENGOLF コーチング',
    subtitle: 'PGA認定プロによるゴルフレッスン',
    ourCoaches: 'コーチ紹介',
    specialties: '専門分野',
    career: '経歴',
    education: '学歴',
    certifications: '資格',
    viewAvailability: 'スケジュールを見る',
    pricing: 'レッスン料金',
    lessonPackages: 'レッスンパッケージ',
    specialPackages: 'スペシャルパッケージ',
    availability: 'コーチのスケジュール',
    noAvailability: '空きなし',
    perHour: '/時間',
    golfer: '名',
    golfers: '名',
    golfers3to5: '3〜5名',
    validity: '有効期間',
    bookViaLine: 'LINEで予約',
    bookNow: '今すぐ予約',
    packageIncludes: 'パッケージ内容',
    today: '今日',
    monday: '月',
    tuesday: '火',
    wednesday: '水',
    thursday: '木',
    friday: '金',
    saturday: '土',
    sunday: '日',
    loadingAvailability: 'スケジュールを読み込み中...',
    freeTrialTitle: '無料体験レッスン 1時間',
    freeTrialSubtitle: 'プロと一緒に',
    freeTrialBenefit1: 'わかりやすいテクニック',
    freeTrialBenefit2: 'しっかりした基礎',
    freeTrialBenefit3: 'コースデビュー準備OK',
    freeTrialCta: '今すぐ予約！',
  },
  zh: {
    title: 'LENGOLF 教练课程',
    subtitle: 'PGA认证专业高尔夫教练',
    ourCoaches: '教练团队',
    specialties: '专业领域',
    career: '职业经历',
    education: '教育背景',
    certifications: '资质认证',
    viewAvailability: '查看排期',
    pricing: '课程价格',
    lessonPackages: '课程套餐',
    specialPackages: '特别套餐',
    availability: '教练排期',
    noAvailability: '暂无空余时段',
    perHour: '/小时',
    golfer: '名球手',
    golfers: '名球手',
    golfers3to5: '3-5名球手',
    validity: '有效期',
    bookViaLine: '通过LINE预约',
    bookNow: '立即预约',
    packageIncludes: '套餐包含',
    today: '今天',
    monday: '周一',
    tuesday: '周二',
    wednesday: '周三',
    thursday: '周四',
    friday: '周五',
    saturday: '周六',
    sunday: '周日',
    loadingAvailability: '正在加载排期...',
    freeTrialTitle: '免费体验课 1小时',
    freeTrialSubtitle: '与我们的专业教练一起',
    freeTrialBenefit1: '简单易懂的技巧',
    freeTrialBenefit2: '扎实的基础',
    freeTrialBenefit3: '准备好上球场',
    freeTrialCta: '立即预约！',
  },
};
