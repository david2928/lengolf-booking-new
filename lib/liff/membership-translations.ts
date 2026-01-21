import { Language } from './translations';

export interface MembershipTranslations {
  // Header
  title: string;
  welcome: string;
  welcomeBack: string;

  // Profile Section
  memberSince: string;
  customerCode: string;
  email: string;
  phone: string;

  // Packages Section
  myPackages: string;
  activePackages: string;
  pastPackages: string;
  noActivePackages: string;
  noPastPackages: string;
  hoursRemaining: string;
  expires: string;
  expired: string;
  unlimited: string;
  hours: string;
  sessions: string;
  purchasedOn: string;
  validUntil: string;

  // Bookings Section
  upcomingBookings: string;
  noUpcomingBookings: string;
  viewAll: string;
  on: string;
  at: string;
  bay: string;
  toBeDetermined: string;
  people: string;
  confirmed: string;
  cancelled: string;
  completed: string;

  // Linking Flow
  linkYourAccount: string;
  linkAccountDescription: string;
  enterPhone: string;
  phoneNumberPlaceholder: string;
  linkButton: string;
  linking: string;
  accountNotFound: string;
  accountLinked: string;
  accountCreated: string;
  accountAlreadyLinked: string;
  contactStaff: string;

  // Quick Actions
  quickActions: string;
  bookNow: string;
  viewPromotions: string;
  viewBayRates: string;
  contactUs: string;

  // Booking Actions
  cancelBooking: string;
  confirmCancellation: string;
  cancelConfirmMessage: string;
  cancellationReason: string;
  cancellationReasonPlaceholder: string;
  yesCancelBooking: string;
  keepBooking: string;
  cancelling: string;
  bookingCancelled: string;
  bookingCancelledDescription: string;
  done: string;
  socialBay: string;
  aiBay: string;

  // Common
  loading: string;
  error: string;
  retry: string;
  close: string;
}

export const membershipTranslations: Record<Language, MembershipTranslations> = {
  en: {
    // Header
    title: 'LENGOLF Membership',
    welcome: 'Welcome',
    welcomeBack: 'Welcome back',

    // Profile Section
    memberSince: 'Member since',
    customerCode: 'Member ID',
    email: 'Email',
    phone: 'Phone',

    // Packages Section
    myPackages: 'My Packages',
    activePackages: 'Active Packages',
    pastPackages: 'Past Packages',
    noActivePackages: 'You have no active packages at the moment.',
    noPastPackages: 'No past packages.',
    hoursRemaining: 'hours remaining',
    expires: 'Expires',
    expired: 'Expired',
    unlimited: 'Unlimited',
    hours: 'hours',
    sessions: 'sessions',
    purchasedOn: 'Purchased on',
    validUntil: 'Valid until',

    // Bookings Section
    upcomingBookings: 'Upcoming Bookings',
    noUpcomingBookings: 'You have no upcoming bookings.',
    viewAll: 'View All',
    on: 'on',
    at: 'at',
    bay: 'Bay',
    toBeDetermined: 'TBD',
    people: 'people',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    completed: 'Completed',

    // Linking Flow
    linkYourAccount: 'Link Your Account',
    linkAccountDescription: 'Enter your phone number to access your membership details, packages, and booking history.',
    enterPhone: 'Enter your phone number',
    phoneNumberPlaceholder: '0812345678',
    linkButton: 'Link Account',
    linking: 'Linking...',
    accountNotFound: 'Account not found. Creating a new member account for you.',
    accountLinked: 'Account successfully linked!',
    accountCreated: 'Welcome! Your member account has been created.',
    accountAlreadyLinked: 'This phone number is already linked to another account. Please contact staff if this is an error.',
    contactStaff: 'Need help? Contact our staff.',

    // Quick Actions
    quickActions: 'Quick Actions',
    bookNow: 'Book Now',
    viewPromotions: 'View Promotions',
    viewBayRates: 'Bay Rates',
    contactUs: 'Contact Us',

    // Booking Actions
    cancelBooking: 'Cancel Booking',
    confirmCancellation: 'Confirm Cancellation',
    cancelConfirmMessage: 'Are you sure you want to cancel this booking? This action cannot be undone.',
    cancellationReason: 'Reason for cancellation (optional)',
    cancellationReasonPlaceholder: 'Let us know why you\'re cancelling...',
    yesCancelBooking: 'Yes, Cancel Booking',
    keepBooking: 'Keep Booking',
    cancelling: 'Cancelling...',
    bookingCancelled: 'Booking Cancelled',
    bookingCancelledDescription: 'Your booking has been cancelled. A confirmation will be sent to your email.',
    done: 'Done',
    socialBay: 'Social Bay',
    aiBay: 'AI Bay',

    // Common
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    close: 'Close',
  },
  th: {
    // Header
    title: 'สมาชิก LENGOLF',
    welcome: 'ยินดีต้อนรับ',
    welcomeBack: 'ยินดีต้อนรับกลับ',

    // Profile Section
    memberSince: 'สมาชิกตั้งแต่',
    customerCode: 'รหัสสมาชิก',
    email: 'อีเมล',
    phone: 'เบอร์โทร',

    // Packages Section
    myPackages: 'แพ็กเกจของฉัน',
    activePackages: 'แพ็กเกจที่ใช้งานได้',
    pastPackages: 'แพ็กเกจที่ผ่านมา',
    noActivePackages: 'คุณยังไม่มีแพ็กเกจที่ใช้งานได้ในขณะนี้',
    noPastPackages: 'ไม่มีแพ็กเกจที่ผ่านมา',
    hoursRemaining: 'ชั่วโมงคงเหลือ',
    expires: 'หมดอายุ',
    expired: 'หมดอายุแล้ว',
    unlimited: 'ไม่จำกัด',
    hours: 'ชั่วโมง',
    sessions: 'ครั้ง',
    purchasedOn: 'ซื้อเมื่อ',
    validUntil: 'ใช้ได้ถึง',

    // Bookings Section
    upcomingBookings: 'การจองที่กำลังจะมาถึง',
    noUpcomingBookings: 'คุณยังไม่มีการจอง',
    viewAll: 'ดูทั้งหมด',
    on: 'วันที่',
    at: 'เวลา',
    bay: 'เบย์',
    toBeDetermined: 'ยังไม่กำหนด',
    people: 'คน',
    confirmed: 'ยืนยันแล้ว',
    cancelled: 'ยกเลิกแล้ว',
    completed: 'เสร็จสิ้น',

    // Linking Flow
    linkYourAccount: 'เชื่อมโยงบัญชี',
    linkAccountDescription: 'กรอกเบอร์โทรศัพท์เพื่อเข้าถึงข้อมูลสมาชิก แพ็กเกจ และประวัติการจอง',
    enterPhone: 'กรอกเบอร์โทรศัพท์',
    phoneNumberPlaceholder: '0812345678',
    linkButton: 'เชื่อมโยงบัญชี',
    linking: 'กำลังเชื่อมโยง...',
    accountNotFound: 'ไม่พบบัญชี กำลังสร้างบัญชีสมาชิกใหม่ให้คุณ',
    accountLinked: 'เชื่อมโยงบัญชีสำเร็จ!',
    accountCreated: 'ยินดีต้อนรับ! สร้างบัญชีสมาชิกของคุณเรียบร้อยแล้ว',
    accountAlreadyLinked: 'เบอร์โทรศัพท์นี้ถูกเชื่อมโยงกับบัญชีอื่นแล้ว กรุณาติดต่อทีมงานหากคิดว่ามีข้อผิดพลาด',
    contactStaff: 'ต้องการความช่วยเหลือ? ติดต่อทีมงานของเรา',

    // Quick Actions
    quickActions: 'เมนูด่วน',
    bookNow: 'จองเลย',
    viewPromotions: 'ดูโปรโมชั่น',
    viewBayRates: 'ราคาเบย์',
    contactUs: 'ติดต่อเรา',

    // Booking Actions
    cancelBooking: 'ยกเลิกการจอง',
    confirmCancellation: 'ยืนยันการยกเลิก',
    cancelConfirmMessage: 'คุณแน่ใจหรือไม่ที่จะยกเลิกการจองนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
    cancellationReason: 'เหตุผลในการยกเลิก (ไม่บังคับ)',
    cancellationReasonPlaceholder: 'บอกเราว่าทำไมคุณถึงยกเลิก...',
    yesCancelBooking: 'ใช่ ยกเลิกการจอง',
    keepBooking: 'เก็บการจองไว้',
    cancelling: 'กำลังยกเลิก...',
    bookingCancelled: 'ยกเลิกการจองแล้ว',
    bookingCancelledDescription: 'การจองของคุณถูกยกเลิกแล้ว จะมีการส่งยืนยันไปยังอีเมลของคุณ',
    done: 'เสร็จสิ้น',
    socialBay: 'Social Bay',
    aiBay: 'AI Bay',

    // Common
    loading: 'กำลังโหลด...',
    error: 'เกิดข้อผิดพลาด',
    retry: 'ลองใหม่',
    close: 'ปิด',
  },
};
