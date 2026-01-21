import { Language } from './translations';

export interface BookingTranslations {
  // Header
  title: string;
  back: string;

  // Date Selection
  selectDate: string;
  today: string;
  tomorrow: string;
  otherDate: string;

  // Time Selection
  selectTime: string;
  morning: string;
  afternoon: string;
  evening: string;
  noSlotsAvailable: string;
  maxHours: string;
  hour: string;
  hours: string;

  // Booking Form
  bookingDetails: string;
  contactInfo: string;
  name: string;
  namePlaceholder: string;
  phone: string;
  phonePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  duration: string;
  selectDuration: string;
  numberOfPeople: string;
  person: string;
  people: string;
  bayPreference: string;
  anyBay: string;
  socialBay: string;
  socialBayDescription: string;
  aiLab: string;
  aiLabDescription: string;
  notes: string;
  notesPlaceholder: string;

  // Play & Food Packages
  playFoodPackages: string;
  noPackage: string;
  perPerson: string;
  includes: string;
  unlimitedSoftDrinks: string;
  popularChoice: string;

  // Club Rental
  clubRental: string;
  noRental: string;
  standardClubs: string;
  premiumClubs: string;
  free: string;

  // Package Info
  usingPackage: string;
  hoursRemaining: string;
  normalRate: string;

  // Summary
  bookingSummary: string;
  date: string;
  time: string;
  bay: string;
  totalDuration: string;
  guests: string;
  package: string;
  playFoodPackage: string;
  clubs: string;
  confirm: string;
  confirmBooking: string;
  processing: string;

  // Success
  bookingConfirmed: string;
  bookingId: string;
  thankYou: string;
  confirmationSent: string;
  viewBooking: string;
  bookAnother: string;
  close: string;

  // Link Account
  linkRequired: string;
  linkDescription: string;
  linkAccount: string;

  // Common
  loading: string;
  error: string;
  retry: string;
  next: string;
  cancel: string;

  // Validation
  nameRequired: string;
  phoneRequired: string;
  emailRequired: string;
  invalidEmail: string;
  invalidPhone: string;
  selectTimeSlot: string;
}

export const bookingTranslations: Record<Language, BookingTranslations> = {
  en: {
    // Header
    title: 'Book a Bay',
    back: 'Back',

    // Date Selection
    selectDate: 'Select Date',
    today: 'Today',
    tomorrow: 'Tomorrow',
    otherDate: 'Other Date',

    // Time Selection
    selectTime: 'Select Time',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    noSlotsAvailable: 'No slots available for this date',
    maxHours: 'max',
    hour: 'hour',
    hours: 'hours',

    // Booking Form
    bookingDetails: 'Booking Details',
    contactInfo: 'Contact Information',
    name: 'Name',
    namePlaceholder: 'Enter your name',
    phone: 'Phone',
    phonePlaceholder: '0812345678',
    email: 'Email',
    emailPlaceholder: 'your@email.com',
    duration: 'Duration',
    selectDuration: 'Select duration',
    numberOfPeople: 'Number of People',
    person: 'person',
    people: 'people',
    bayPreference: 'Bay Preference',
    anyBay: 'Any Available',
    socialBay: 'Social Bay',
    socialBayDescription: 'Great for groups',
    aiLab: 'AI Lab',
    aiLabDescription: 'Advanced swing analysis',
    notes: 'Special Requests',
    notesPlaceholder: 'Any special requests?',

    // Play & Food Packages
    playFoodPackages: 'Play & Food Packages',
    noPackage: 'No package',
    perPerson: '/person',
    includes: 'Includes',
    unlimitedSoftDrinks: 'Unlimited soft drinks',
    popularChoice: 'Popular',

    // Club Rental
    clubRental: 'Club Rental',
    noRental: 'No rental needed',
    standardClubs: 'Standard Clubs',
    premiumClubs: 'Premium Clubs',
    free: 'Free',

    // Package Info
    usingPackage: 'Using Package',
    hoursRemaining: 'hours remaining',
    normalRate: 'Normal Bay Rate',

    // Summary
    bookingSummary: 'Booking Summary',
    date: 'Date',
    time: 'Time',
    bay: 'Bay',
    totalDuration: 'Duration',
    guests: 'Guests',
    package: 'Package',
    playFoodPackage: 'Play & Food',
    clubs: 'Clubs',
    confirm: 'Confirm',
    confirmBooking: 'Confirm Booking',
    processing: 'Processing...',

    // Success
    bookingConfirmed: 'Booking Confirmed!',
    bookingId: 'Booking ID',
    thankYou: 'Thank you for your booking',
    confirmationSent: 'A confirmation has been sent to your email and LINE',
    viewBooking: 'View Booking',
    bookAnother: 'Book Another',
    close: 'Close',

    // Link Account
    linkRequired: 'Account Linking Required',
    linkDescription: 'Please link your account to continue with the booking. This helps us provide you with a better experience.',
    linkAccount: 'Link Account',

    // Common
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Try Again',
    next: 'Next',
    cancel: 'Cancel',

    // Validation
    nameRequired: 'Name is required',
    phoneRequired: 'Phone number is required',
    emailRequired: 'Email is required',
    invalidEmail: 'Please enter a valid email',
    invalidPhone: 'Please enter a valid phone number',
    selectTimeSlot: 'Please select a time slot',
  },
  th: {
    // Header
    title: 'จองเบย์',
    back: 'กลับ',

    // Date Selection
    selectDate: 'เลือกวันที่',
    today: 'วันนี้',
    tomorrow: 'พรุ่งนี้',
    otherDate: 'วันอื่น',

    // Time Selection
    selectTime: 'เลือกเวลา',
    morning: 'เช้า',
    afternoon: 'บ่าย',
    evening: 'เย็น',
    noSlotsAvailable: 'ไม่มีช่วงเวลาว่างสำหรับวันนี้',
    maxHours: 'สูงสุด',
    hour: 'ชั่วโมง',
    hours: 'ชั่วโมง',

    // Booking Form
    bookingDetails: 'รายละเอียดการจอง',
    contactInfo: 'ข้อมูลการติดต่อ',
    name: 'ชื่อ',
    namePlaceholder: 'กรอกชื่อของคุณ',
    phone: 'เบอร์โทร',
    phonePlaceholder: '0812345678',
    email: 'อีเมล',
    emailPlaceholder: 'your@email.com',
    duration: 'ระยะเวลา',
    selectDuration: 'เลือกระยะเวลา',
    numberOfPeople: 'จำนวนคน',
    person: 'คน',
    people: 'คน',
    bayPreference: 'เบย์ที่ต้องการ',
    anyBay: 'เบย์ใดก็ได้',
    socialBay: 'Social Bay',
    socialBayDescription: 'เหมาะสำหรับกลุ่ม',
    aiLab: 'AI Lab',
    aiLabDescription: 'วิเคราะห์วงสวิงขั้นสูง',
    notes: 'คำขอพิเศษ',
    notesPlaceholder: 'มีคำขอพิเศษไหม?',

    // Play & Food Packages
    playFoodPackages: 'แพ็กเกจเล่น+อาหาร',
    noPackage: 'ไม่ใช้แพ็กเกจ',
    perPerson: '/คน',
    includes: 'รวม',
    unlimitedSoftDrinks: 'น้ำอัดลมไม่อั้น',
    popularChoice: 'ยอดนิยม',

    // Club Rental
    clubRental: 'เช่าไม้กอล์ฟ',
    noRental: 'ไม่ต้องการเช่า',
    standardClubs: 'ไม้มาตรฐาน',
    premiumClubs: 'ไม้พรีเมียม',
    free: 'ฟรี',

    // Package Info
    usingPackage: 'ใช้แพ็กเกจ',
    hoursRemaining: 'ชั่วโมงคงเหลือ',
    normalRate: 'อัตราปกติ',

    // Summary
    bookingSummary: 'สรุปการจอง',
    date: 'วันที่',
    time: 'เวลา',
    bay: 'เบย์',
    totalDuration: 'ระยะเวลา',
    guests: 'จำนวนคน',
    package: 'แพ็กเกจ',
    playFoodPackage: 'เล่น+อาหาร',
    clubs: 'ไม้กอล์ฟ',
    confirm: 'ยืนยัน',
    confirmBooking: 'ยืนยันการจอง',
    processing: 'กำลังดำเนินการ...',

    // Success
    bookingConfirmed: 'จองสำเร็จ!',
    bookingId: 'รหัสการจอง',
    thankYou: 'ขอบคุณสำหรับการจอง',
    confirmationSent: 'ได้ส่งการยืนยันไปที่อีเมลและ LINE ของคุณแล้ว',
    viewBooking: 'ดูการจอง',
    bookAnother: 'จองอีกครั้ง',
    close: 'ปิด',

    // Link Account
    linkRequired: 'ต้องเชื่อมโยงบัญชี',
    linkDescription: 'กรุณาเชื่อมโยงบัญชีเพื่อดำเนินการจองต่อ ซึ่งจะช่วยให้เราสามารถให้บริการคุณได้ดียิ่งขึ้น',
    linkAccount: 'เชื่อมโยงบัญชี',

    // Common
    loading: 'กำลังโหลด...',
    error: 'เกิดข้อผิดพลาด',
    retry: 'ลองใหม่',
    next: 'ถัดไป',
    cancel: 'ยกเลิก',

    // Validation
    nameRequired: 'กรุณากรอกชื่อ',
    phoneRequired: 'กรุณากรอกเบอร์โทร',
    emailRequired: 'กรุณากรอกอีเมล',
    invalidEmail: 'กรุณากรอกอีเมลที่ถูกต้อง',
    invalidPhone: 'กรุณากรอกเบอร์โทรที่ถูกต้อง',
    selectTimeSlot: 'กรุณาเลือกช่วงเวลา',
  },
};
