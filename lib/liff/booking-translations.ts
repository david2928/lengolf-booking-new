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

  // Play & Food Package Details
  viewDetails: string;
  bayOnly: string;
  normalRates: string;
  bayRentalNormalRates: string;

  // Club Rental
  clubRental: string;
  noRental: string;
  ownClubs: string;
  standardClubs: string;
  premiumClubs: string;
  premiumClubsSelected: string;
  free: string;
  fullDay: string;

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

    // Play & Food Package Details
    viewDetails: 'View Details',
    bayOnly: 'Bay Only',
    normalRates: 'Normal rates',
    bayRentalNormalRates: 'Bay rental will be charged at normal hourly rates',

    // Club Rental
    clubRental: 'Club Rental',
    noRental: 'No rental needed',
    ownClubs: 'Own clubs',
    standardClubs: 'Standard Clubs',
    premiumClubs: 'Premium Clubs',
    premiumClubsSelected: 'Premium Clubs Selected',
    free: 'Free',
    fullDay: 'Full day',

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
    confirmationSent: 'A confirmation has been sent to your email',
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

    // Play & Food Package Details
    viewDetails: 'ดูรายละเอียด',
    bayOnly: 'เบย์อย่างเดียว',
    normalRates: 'อัตราปกติ',
    bayRentalNormalRates: 'ค่าเช่าเบย์คิดตามอัตราปกติรายชั่วโมง',

    // Club Rental
    clubRental: 'เช่าไม้กอล์ฟ',
    noRental: 'ไม่ต้องการเช่า',
    ownClubs: 'ใช้ไม้ของตัวเอง',
    standardClubs: 'ไม้มาตรฐาน',
    premiumClubs: 'ไม้พรีเมียม',
    premiumClubsSelected: 'เลือกไม้พรีเมียมแล้ว',
    free: 'ฟรี',
    fullDay: 'ทั้งวัน',

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
    confirmationSent: 'ได้ส่งการยืนยันไปที่อีเมลของคุณแล้ว',
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
  ja: {
    // Header
    title: 'ベイを予約',
    back: '戻る',

    // Date Selection
    selectDate: '日付を選択',
    today: '今日',
    tomorrow: '明日',
    otherDate: '他の日',

    // Time Selection
    selectTime: '時間を選択',
    morning: '午前',
    afternoon: '午後',
    evening: '夕方',
    noSlotsAvailable: 'この日に空きはありません',
    maxHours: '最大',
    hour: '時間',
    hours: '時間',

    // Booking Form
    bookingDetails: '予約詳細',
    contactInfo: '連絡先情報',
    name: 'お名前',
    namePlaceholder: 'お名前を入力',
    phone: '電話番号',
    phonePlaceholder: '0812345678',
    email: 'メール',
    emailPlaceholder: 'your@email.com',
    duration: '利用時間',
    selectDuration: '利用時間を選択',
    numberOfPeople: '人数',
    person: '名',
    people: '名',
    bayPreference: 'ベイの希望',
    anyBay: '指定なし',
    socialBay: 'ソーシャルベイ',
    socialBayDescription: 'グループにおすすめ',
    aiLab: 'AI Lab',
    aiLabDescription: '高度なスイング分析',
    notes: 'ご要望',
    notesPlaceholder: 'ご要望があればお書きください',

    // Play & Food Packages
    playFoodPackages: 'プレー＆フードパッケージ',
    noPackage: 'パッケージなし',
    perPerson: '/名',
    includes: '含む',
    unlimitedSoftDrinks: 'ソフトドリンク飲み放題',
    popularChoice: '人気',

    // Play & Food Package Details
    viewDetails: '詳細を見る',
    bayOnly: 'ベイのみ',
    normalRates: '通常料金',
    bayRentalNormalRates: 'ベイ利用料は通常の時間料金が適用されます',

    // Club Rental
    clubRental: 'クラブレンタル',
    noRental: 'レンタル不要',
    ownClubs: '自分のクラブ',
    standardClubs: 'スタンダードクラブ',
    premiumClubs: 'プレミアムクラブ',
    premiumClubsSelected: 'プレミアムクラブ選択済み',
    free: '無料',
    fullDay: '終日',

    // Package Info
    usingPackage: 'パッケージ利用',
    hoursRemaining: '時間残り',
    normalRate: '通常料金',

    // Summary
    bookingSummary: '予約内容',
    date: '日付',
    time: '時間',
    bay: 'ベイ',
    totalDuration: '利用時間',
    guests: '人数',
    package: 'パッケージ',
    playFoodPackage: 'プレー＆フード',
    clubs: 'クラブ',
    confirm: '確認',
    confirmBooking: '予約を確定',
    processing: '処理中...',

    // Success
    bookingConfirmed: '予約完了！',
    bookingId: '予約ID',
    thankYou: 'ご予約ありがとうございます',
    confirmationSent: '確認メールをお送りしました',
    viewBooking: '予約を確認',
    bookAnother: '別の予約をする',
    close: '閉じる',

    // Link Account
    linkRequired: 'アカウント連携が必要です',
    linkDescription: '予約を続けるにはアカウントを連携してください。より良いサービスをご提供できます。',
    linkAccount: 'アカウントを連携',

    // Common
    loading: '読み込み中...',
    error: 'エラーが発生しました',
    retry: '再試行',
    next: '次へ',
    cancel: 'キャンセル',

    // Validation
    nameRequired: 'お名前を入力してください',
    phoneRequired: '電話番号を入力してください',
    emailRequired: 'メールアドレスを入力してください',
    invalidEmail: '正しいメールアドレスを入力してください',
    invalidPhone: '正しい電話番号を入力してください',
    selectTimeSlot: '時間帯を選択してください',
  },
  zh: {
    // Header
    title: '预约球位',
    back: '返回',

    // Date Selection
    selectDate: '选择日期',
    today: '今天',
    tomorrow: '明天',
    otherDate: '其他日期',

    // Time Selection
    selectTime: '选择时间',
    morning: '上午',
    afternoon: '下午',
    evening: '晚间',
    noSlotsAvailable: '该日期暂无可用时段',
    maxHours: '最多',
    hour: '小时',
    hours: '小时',

    // Booking Form
    bookingDetails: '预约详情',
    contactInfo: '联系信息',
    name: '姓名',
    namePlaceholder: '请输入您的姓名',
    phone: '电话',
    phonePlaceholder: '0812345678',
    email: '邮箱',
    emailPlaceholder: 'your@email.com',
    duration: '时长',
    selectDuration: '选择时长',
    numberOfPeople: '人数',
    person: '人',
    people: '人',
    bayPreference: '球位偏好',
    anyBay: '任意可用',
    socialBay: 'Social Bay',
    socialBayDescription: '适合团体',
    aiLab: 'AI Lab',
    aiLabDescription: '高级挥杆分析',
    notes: '特殊要求',
    notesPlaceholder: '有什么特殊要求吗？',

    // Play & Food Packages
    playFoodPackages: '畅玩美食套餐',
    noPackage: '不需要套餐',
    perPerson: '/人',
    includes: '包含',
    unlimitedSoftDrinks: '无限量软饮',
    popularChoice: '热门',

    // Play & Food Package Details
    viewDetails: '查看详情',
    bayOnly: '仅球位',
    normalRates: '标准价格',
    bayRentalNormalRates: '球位租赁按标准小时费率计费',

    // Club Rental
    clubRental: '球杆租赁',
    noRental: '无需租赁',
    ownClubs: '自带球杆',
    standardClubs: '标准球杆',
    premiumClubs: '高级球杆',
    premiumClubsSelected: '已选择高级球杆',
    free: '免费',
    fullDay: '全天',

    // Package Info
    usingPackage: '使用套餐',
    hoursRemaining: '小时剩余',
    normalRate: '标准价格',

    // Summary
    bookingSummary: '预约摘要',
    date: '日期',
    time: '时间',
    bay: '球位',
    totalDuration: '时长',
    guests: '人数',
    package: '套餐',
    playFoodPackage: '畅玩美食',
    clubs: '球杆',
    confirm: '确认',
    confirmBooking: '确认预约',
    processing: '处理中...',

    // Success
    bookingConfirmed: '预约成功！',
    bookingId: '预约编号',
    thankYou: '感谢您的预约',
    confirmationSent: '确认信息已发送至您的邮箱',
    viewBooking: '查看预约',
    bookAnother: '再次预约',
    close: '关闭',

    // Link Account
    linkRequired: '需要关联账户',
    linkDescription: '请关联您的账户以继续预约。这将帮助我们为您提供更好的服务。',
    linkAccount: '关联账户',

    // Common
    loading: '加载中...',
    error: '出现错误',
    retry: '重试',
    next: '下一步',
    cancel: '取消',

    // Validation
    nameRequired: '请输入姓名',
    phoneRequired: '请输入电话号码',
    emailRequired: '请输入邮箱',
    invalidEmail: '请输入有效的邮箱地址',
    invalidPhone: '请输入有效的电话号码',
    selectTimeSlot: '请选择时间段',
  },
};
