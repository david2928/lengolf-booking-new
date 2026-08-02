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

  // Modal Labels
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  guestsLabel: string;

  // Booking Detail Page
  bookingDetails: string;
  backToBookings: string;
  bookAgain: string;

  // Edit booking (in-place edit flow)
  editBooking: string;
  editTitle: string;
  editIntro: string;
  selectNewDate: string;
  selectNewTime: string;
  otherDate: string;
  currentTimeLabel: string;
  noTimesAvailable: string;
  guests: string;
  bayNoteSocial: string;
  bayNoteAiLab: string;
  reviewChanges: string;
  reviewTitle: string;
  reviewIntro: string;
  beforeLabel: string;
  afterLabel: string;
  unchangedLabel: string;
  noChangesYet: string;
  backToEdit: string;
  confirmChanges: string;
  savingChanges: string;
  noChargeNote: string;
  editSuccessTitle: string;
  editSuccessBody: string;
  editSuccessEmailNote: string;
  coachingEditHint: string;
  errSlotUnavailable: string;
  errSlotUnavailableSameType: string;
  errTooLateToEdit: string;
  errBookingInPast: string;
  errCoaching: string;
  errPackageExpired: string;
  errCreditInvariant: string;
  errClubSetUnavailable: string;
  errDurationLocked: string;
  errStateChanged: string;
  errSessionExpired: string;
  errEditDefault: string;
  bookingId: string;
  bookingType: string;
  regular: string;
  package: string;
  coaching: string;
  notes: string;
  bookedOn: string;
  time: string;
  cancellationReasonLabel: string;
  bookingNotFound: string;
  bookingNotFoundDescription: string;
  accessDenied: string;
  accessDeniedDescription: string;

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

    // Modal Labels
    dateLabel: 'Date',
    timeLabel: 'Time',
    durationLabel: 'Duration',
    guestsLabel: 'Guests',

    // Booking Detail Page
    bookingDetails: 'Booking Details',
    backToBookings: 'Back to My Bookings',
    bookAgain: 'Book Again',
    editBooking: 'Edit Booking',
    editTitle: 'Edit Booking',
    editIntro: 'Pick a new date, time, or length. You keep the same booking and the same bay type.',
    selectNewDate: 'Date',
    selectNewTime: 'Start time',
    otherDate: 'Other date',
    currentTimeLabel: 'Dashed outline is your current time',
    noTimesAvailable: 'No times available on this date. Try another day.',
    guests: 'Guests',
    bayNoteSocial: 'You are in a Social Bay and will stay in one.',
    bayNoteAiLab: 'You are in the AI Lab and will stay there.',
    reviewChanges: 'Review Changes',
    reviewTitle: 'Review Changes',
    reviewIntro: 'Check the details below, then confirm.',
    beforeLabel: 'Before',
    afterLabel: 'After',
    unchangedLabel: 'Unchanged',
    noChangesYet: 'You have not changed anything yet.',
    backToEdit: 'Back to Edit',
    confirmChanges: 'Confirm Changes',
    savingChanges: 'Saving',
    noChargeNote: 'No charge for changing your booking.',
    editSuccessTitle: 'Booking Updated',
    editSuccessBody: 'Your booking is confirmed for the new time, and the booking ID stays the same.',
    editSuccessEmailNote: 'We have emailed you the updated details and told our team.',
    coachingEditHint: 'To reschedule a lesson, please message us on LINE.',
    errSlotUnavailable: 'That time was just taken. Please pick another.',
    errSlotUnavailableSameType: 'The AI Lab is booked at that time. Please pick another time.',
    errTooLateToEdit: 'It is too close to your start time to change this online. Message us on LINE and we will help.',
    errBookingInPast: 'This booking has already started, so it can no longer be changed.',
    errCoaching: 'Coaching sessions are scheduled with your coach. Message us on LINE to reschedule.',
    errPackageExpired: 'Your package expires before that date. Please choose an earlier date.',
    errCreditInvariant: 'This booking has free credit applied, so it cannot be made shorter.',
    errClubSetUnavailable: 'Your reserved clubs are already booked at that time. Please choose another slot.',
    errDurationLocked: 'Your Play & Food set includes a fixed number of hours. You can still move the date and time.',
    errStateChanged: 'This booking changed while you were editing. Please reload and try again.',
    errSessionExpired: 'Your session expired. Please reopen this page from LINE.',
    errEditDefault: 'We could not save your changes. Please try again.',
    bookingId: 'Booking ID',
    bookingType: 'Booking Type',
    regular: 'Regular',
    package: 'Package',
    coaching: 'Coaching',
    notes: 'Notes',
    bookedOn: 'Booked on',
    time: 'Time',
    cancellationReasonLabel: 'Cancellation Reason',
    bookingNotFound: 'Booking Not Found',
    bookingNotFoundDescription: 'The booking you are looking for does not exist or has been removed.',
    accessDenied: 'Access Denied',
    accessDeniedDescription: 'You do not have permission to view this booking.',

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

    // Modal Labels
    dateLabel: 'วันที่',
    timeLabel: 'เวลา',
    durationLabel: 'ระยะเวลา',
    guestsLabel: 'จำนวนคน',

    // Booking Detail Page
    bookingDetails: 'รายละเอียดการจอง',
    backToBookings: 'กลับไปยังการจองของฉัน',
    bookAgain: 'จองอีกครั้ง',
    editBooking: 'แก้ไขการจอง',
    editTitle: 'แก้ไขการจอง',
    editIntro: 'เลือกวันที่ เวลา หรือระยะเวลาใหม่ได้เลยค่ะ การจองและประเภทเบย์ยังคงเดิม',
    selectNewDate: 'วันที่',
    selectNewTime: 'เวลาเริ่ม',
    otherDate: 'วันอื่น',
    currentTimeLabel: 'กรอบเส้นประคือเวลาปัจจุบันของคุณ',
    noTimesAvailable: 'วันนี้ไม่มีเวลาว่างค่ะ ลองเลือกวันอื่นนะคะ',
    guests: 'จำนวนผู้เล่น',
    bayNoteSocial: 'คุณอยู่ที่ Social Bay และจะยังอยู่ที่ Social Bay ค่ะ',
    bayNoteAiLab: 'คุณอยู่ที่ AI Lab และจะยังอยู่ที่ AI Lab ค่ะ',
    reviewChanges: 'ตรวจสอบการเปลี่ยนแปลง',
    reviewTitle: 'ตรวจสอบการเปลี่ยนแปลง',
    reviewIntro: 'กรุณาตรวจสอบรายละเอียดด้านล่าง แล้วกดยืนยันค่ะ',
    beforeLabel: 'เดิม',
    afterLabel: 'ใหม่',
    unchangedLabel: 'ไม่เปลี่ยนแปลง',
    noChangesYet: 'ยังไม่มีการเปลี่ยนแปลงค่ะ',
    backToEdit: 'กลับไปแก้ไข',
    confirmChanges: 'ยืนยันการเปลี่ยนแปลง',
    savingChanges: 'กำลังบันทึก',
    noChargeNote: 'ไม่มีค่าใช้จ่ายในการเปลี่ยนแปลงการจองค่ะ',
    editSuccessTitle: 'อัปเดตการจองแล้ว',
    editSuccessBody: 'การจองของคุณได้รับการยืนยันตามเวลาใหม่แล้วค่ะ รหัสการจองยังคงเดิม',
    editSuccessEmailNote: 'เราได้ส่งอีเมลรายละเอียดใหม่ให้คุณ และแจ้งทีมงานเรียบร้อยแล้วค่ะ',
    coachingEditHint: 'หากต้องการเปลี่ยนเวลาเรียน กรุณาทักหาเราทาง LINE นะคะ',
    errSlotUnavailable: 'เวลานี้เพิ่งถูกจองไปค่ะ กรุณาเลือกเวลาอื่นนะคะ',
    errSlotUnavailableSameType: 'AI Lab ถูกจองในเวลานั้นแล้วค่ะ กรุณาเลือกเวลาอื่นนะคะ',
    errTooLateToEdit: 'ใกล้เวลาเริ่มมากเกินกว่าจะเปลี่ยนออนไลน์ได้ค่ะ ทักหาเราทาง LINE ได้เลยนะคะ',
    errBookingInPast: 'การจองนี้เริ่มไปแล้ว จึงไม่สามารถเปลี่ยนแปลงได้ค่ะ',
    errCoaching: 'คลาสเรียนต้องนัดหมายกับโค้ชค่ะ ทักหาเราทาง LINE เพื่อเปลี่ยนเวลานะคะ',
    errPackageExpired: 'แพ็กเกจของคุณหมดอายุก่อนวันดังกล่าวค่ะ กรุณาเลือกวันที่เร็วขึ้นนะคะ',
    errCreditInvariant: 'การจองนี้ใช้เครดิตฟรีอยู่ จึงลดระยะเวลาลงไม่ได้ค่ะ',
    errClubSetUnavailable: 'ชุดไม้กอล์ฟที่คุณจองไว้ถูกใช้ในเวลานั้นแล้วค่ะ กรุณาเลือกเวลาอื่นนะคะ',
    errDurationLocked: 'เซ็ต Play & Food มีจำนวนชั่วโมงที่กำหนดไว้ค่ะ แต่ยังเปลี่ยนวันและเวลาได้นะคะ',
    errStateChanged: 'การจองนี้มีการเปลี่ยนแปลงระหว่างที่คุณแก้ไขค่ะ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้งนะคะ',
    errSessionExpired: 'เซสชันหมดอายุค่ะ กรุณาเปิดหน้านี้จาก LINE อีกครั้งนะคะ',
    errEditDefault: 'ไม่สามารถบันทึกการเปลี่ยนแปลงได้ค่ะ กรุณาลองใหม่อีกครั้งนะคะ',
    bookingId: 'รหัสการจอง',
    bookingType: 'ประเภทการจอง',
    regular: 'ทั่วไป',
    package: 'แพ็กเกจ',
    coaching: 'โค้ชชิ่ง',
    notes: 'หมายเหตุ',
    bookedOn: 'จองเมื่อ',
    time: 'เวลา',
    cancellationReasonLabel: 'เหตุผลในการยกเลิก',
    bookingNotFound: 'ไม่พบการจอง',
    bookingNotFoundDescription: 'ไม่พบการจองที่คุณกำลังมองหา หรืออาจถูกลบไปแล้ว',
    accessDenied: 'ไม่มีสิทธิ์เข้าถึง',
    accessDeniedDescription: 'คุณไม่มีสิทธิ์ดูการจองนี้',

    // Common
    loading: 'กำลังโหลด...',
    error: 'เกิดข้อผิดพลาด',
    retry: 'ลองใหม่',
    close: 'ปิด',
  },
  ja: {
    // Header
    title: 'LENGOLF メンバーシップ',
    welcome: 'ようこそ',
    welcomeBack: 'お帰りなさい',

    // Profile Section
    memberSince: '会員登録日',
    customerCode: '会員ID',
    email: 'メール',
    phone: '電話番号',

    // Packages Section
    myPackages: 'マイパッケージ',
    activePackages: '有効なパッケージ',
    pastPackages: '過去のパッケージ',
    noActivePackages: '現在有効なパッケージはありません。',
    noPastPackages: '過去のパッケージはありません。',
    hoursRemaining: '時間残り',
    expires: '有効期限',
    expired: '期限切れ',
    unlimited: '無制限',
    hours: '時間',
    sessions: '回',
    purchasedOn: '購入日',
    validUntil: '有効期限',

    // Bookings Section
    upcomingBookings: '今後の予約',
    noUpcomingBookings: '今後の予約はありません。',
    viewAll: 'すべて見る',
    on: '日付',
    at: '時間',
    bay: 'ベイ',
    toBeDetermined: '未定',
    people: '名',
    confirmed: '確認済み',
    cancelled: 'キャンセル済み',
    completed: '完了',

    // Linking Flow
    linkYourAccount: 'アカウント連携',
    linkAccountDescription: '電話番号を入力して、会員情報・パッケージ・予約履歴にアクセスできます。',
    enterPhone: '電話番号を入力',
    phoneNumberPlaceholder: '0812345678',
    linkButton: 'アカウントを連携',
    linking: '連携中...',
    accountNotFound: 'アカウントが見つかりません。新しい会員アカウントを作成します。',
    accountLinked: 'アカウント連携完了！',
    accountCreated: 'ようこそ！会員アカウントが作成されました。',
    accountAlreadyLinked: 'この電話番号は既に別のアカウントに連携されています。間違いの場合はスタッフにお問い合わせください。',
    contactStaff: 'お困りですか？スタッフにお問い合わせください。',

    // Quick Actions
    quickActions: 'クイックメニュー',
    bookNow: '今すぐ予約',
    viewPromotions: 'プロモーション',
    viewBayRates: '料金表',
    contactUs: 'お問い合わせ',

    // Booking Actions
    cancelBooking: '予約をキャンセル',
    confirmCancellation: 'キャンセルの確認',
    cancelConfirmMessage: 'この予約をキャンセルしますか？この操作は取り消せません。',
    cancellationReason: 'キャンセル理由（任意）',
    cancellationReasonPlaceholder: 'キャンセルの理由をお聞かせください...',
    yesCancelBooking: 'はい、キャンセルする',
    keepBooking: '予約を維持',
    cancelling: 'キャンセル中...',
    bookingCancelled: '予約がキャンセルされました',
    bookingCancelledDescription: '予約がキャンセルされました。確認メールをお送りします。',
    done: '完了',
    socialBay: 'ソーシャルベイ',
    aiBay: 'AIベイ',

    // Modal Labels
    dateLabel: '日付',
    timeLabel: '時間',
    durationLabel: '利用時間',
    guestsLabel: '人数',

    // Booking Detail Page
    bookingDetails: '予約詳細',
    backToBookings: '予約一覧に戻る',
    bookAgain: '再予約',
    editBooking: '予約を変更',
    editTitle: 'ご予約の変更',
    editIntro: '新しい日付、時間、利用時間をお選びください。予約とベイの種類はそのままです。',
    selectNewDate: '日付',
    selectNewTime: '開始時刻',
    otherDate: '別の日付',
    currentTimeLabel: '破線は現在のご予約時間です',
    noTimesAvailable: 'この日は空きがありません。別の日をお試しください。',
    guests: '人数',
    bayNoteSocial: 'ソーシャルベイのご予約です。同じ種類のベイをご用意します。',
    bayNoteAiLab: 'AI Lab のご予約です。引き続き AI Lab をご用意します。',
    reviewChanges: '変更内容を確認',
    reviewTitle: '変更内容の確認',
    reviewIntro: '以下の内容をご確認のうえ、確定してください。',
    beforeLabel: '変更前',
    afterLabel: '変更後',
    unchangedLabel: '変更なし',
    noChangesYet: 'まだ変更されていません。',
    backToEdit: '編集に戻る',
    confirmChanges: '変更を確定する',
    savingChanges: '保存しています',
    noChargeNote: '変更に料金はかかりません。',
    editSuccessTitle: 'ご予約を変更しました',
    editSuccessBody: '新しい時間でご予約が確定しました。予約番号は変わりません。',
    editSuccessEmailNote: '新しい内容をメールでお送りし、スタッフにも共有しました。',
    coachingEditHint: 'レッスンの日程変更は LINE でご連絡ください。',
    errSlotUnavailable: 'その時間はたった今埋まりました。別の時間をお選びください。',
    errSlotUnavailableSameType: 'その時間は AI Lab が埋まっています。別の時間をお選びください。',
    errTooLateToEdit: '開始時刻が近いためオンラインでは変更できません。LINE でご連絡ください。',
    errBookingInPast: 'このご予約はすでに開始しているため変更できません。',
    errCoaching: 'レッスンはコーチとの調整が必要です。LINE でご連絡ください。',
    errPackageExpired: 'パッケージの有効期限がその日より前に切れます。より早い日をお選びください。',
    errCreditInvariant: 'このご予約には無料クレジットが適用されているため、短くはできません。',
    errClubSetUnavailable: 'ご予約のクラブセットはその時間すでに貸出予定です。別の時間をお選びください。',
    errDurationLocked: 'Play & Food セットは利用時間が決まっています。日付と時間は変更できます。',
    errStateChanged: '編集中にご予約が変更されました。再読み込みしてお試しください。',
    errSessionExpired: 'セッションの有効期限が切れました。LINE からこのページを開き直してください。',
    errEditDefault: '変更を保存できませんでした。もう一度お試しください。',
    bookingId: '予約ID',
    bookingType: '予約タイプ',
    regular: '通常',
    package: 'パッケージ',
    coaching: 'コーチング',
    notes: '備考',
    bookedOn: '予約日',
    time: '時間',
    cancellationReasonLabel: 'キャンセル理由',
    bookingNotFound: '予約が見つかりません',
    bookingNotFoundDescription: 'お探しの予約は存在しないか、削除されています。',
    accessDenied: 'アクセス拒否',
    accessDeniedDescription: 'この予約を表示する権限がありません。',

    // Common
    loading: '読み込み中...',
    error: 'エラー',
    retry: '再試行',
    close: '閉じる',
  },
  zh: {
    // Header
    title: 'LENGOLF 会员',
    welcome: '欢迎',
    welcomeBack: '欢迎回来',

    // Profile Section
    memberSince: '会员注册日期',
    customerCode: '会员编号',
    email: '邮箱',
    phone: '电话',

    // Packages Section
    myPackages: '我的套餐',
    activePackages: '有效套餐',
    pastPackages: '历史套餐',
    noActivePackages: '您目前没有有效套餐。',
    noPastPackages: '没有历史套餐。',
    hoursRemaining: '小时剩余',
    expires: '到期',
    expired: '已过期',
    unlimited: '不限',
    hours: '小时',
    sessions: '次',
    purchasedOn: '购买日期',
    validUntil: '有效期至',

    // Bookings Section
    upcomingBookings: '即将到来的预约',
    noUpcomingBookings: '您暂无预约。',
    viewAll: '查看全部',
    on: '日期',
    at: '时间',
    bay: '球位',
    toBeDetermined: '待定',
    people: '人',
    confirmed: '已确认',
    cancelled: '已取消',
    completed: '已完成',

    // Linking Flow
    linkYourAccount: '关联账户',
    linkAccountDescription: '输入您的电话号码以访问会员信息、套餐和预约记录。',
    enterPhone: '输入电话号码',
    phoneNumberPlaceholder: '0812345678',
    linkButton: '关联账户',
    linking: '正在关联...',
    accountNotFound: '未找到账户。正在为您创建新的会员账户。',
    accountLinked: '账户关联成功！',
    accountCreated: '欢迎！您的会员账户已创建。',
    accountAlreadyLinked: '此电话号码已关联其他账户。如有疑问请联系工作人员。',
    contactStaff: '需要帮助？请联系我们的工作人员。',

    // Quick Actions
    quickActions: '快捷操作',
    bookNow: '立即预约',
    viewPromotions: '查看优惠',
    viewBayRates: '价目表',
    contactUs: '联系我们',

    // Booking Actions
    cancelBooking: '取消预约',
    confirmCancellation: '确认取消',
    cancelConfirmMessage: '您确定要取消此预约吗？此操作无法撤销。',
    cancellationReason: '取消原因（选填）',
    cancellationReasonPlaceholder: '请告诉我们您取消的原因...',
    yesCancelBooking: '是的，取消预约',
    keepBooking: '保留预约',
    cancelling: '正在取消...',
    bookingCancelled: '预约已取消',
    bookingCancelledDescription: '您的预约已取消。确认信息将发送至您的邮箱。',
    done: '完成',
    socialBay: 'Social Bay',
    aiBay: 'AI Bay',

    // Modal Labels
    dateLabel: '日期',
    timeLabel: '时间',
    durationLabel: '时长',
    guestsLabel: '人数',

    // Booking Detail Page
    bookingDetails: '预约详情',
    backToBookings: '返回我的预约',
    bookAgain: '再次预约',
    editBooking: '更改预约',
    editTitle: '更改预约',
    editIntro: '选择新的日期、时间或时长。预约和打位类型保持不变。',
    selectNewDate: '日期',
    selectNewTime: '开始时间',
    otherDate: '其他日期',
    currentTimeLabel: '虚线框为您当前的时间',
    noTimesAvailable: '这一天没有可预约的时间，请选择其他日期。',
    guests: '人数',
    bayNoteSocial: '您预约的是社交打位，将继续安排同类打位。',
    bayNoteAiLab: '您预约的是 AI Lab，将继续为您保留。',
    reviewChanges: '查看更改',
    reviewTitle: '确认更改',
    reviewIntro: '请核对以下内容后确认。',
    beforeLabel: '更改前',
    afterLabel: '更改后',
    unchangedLabel: '未更改',
    noChangesYet: '您还没有做任何更改。',
    backToEdit: '返回修改',
    confirmChanges: '确认更改',
    savingChanges: '正在保存',
    noChargeNote: '更改预约不收取费用。',
    editSuccessTitle: '预约已更新',
    editSuccessBody: '您的预约已按新时间确认，预约编号保持不变。',
    editSuccessEmailNote: '我们已将更新后的详情发送到您的邮箱，并通知了工作人员。',
    coachingEditHint: '如需更改课程时间，请通过 LINE 联系我们。',
    errSlotUnavailable: '该时间刚刚被预订。请选择其他时间。',
    errSlotUnavailableSameType: '该时间 AI Lab 已被预订。请选择其他时间。',
    errTooLateToEdit: '距离开始时间太近，无法在线更改。请通过 LINE 联系我们。',
    errBookingInPast: '该预约已经开始，无法再更改。',
    errCoaching: '教练课程需要与教练协调时间。请通过 LINE 联系我们。',
    errPackageExpired: '您的套餐在该日期之前到期。请选择更早的日期。',
    errCreditInvariant: '该预约已使用免费额度，因此无法缩短时长。',
    errClubSetUnavailable: '您预订的球杆在该时间已被租出。请选择其他时段。',
    errDurationLocked: 'Play & Food 套餐包含固定时长。您仍然可以更改日期和时间。',
    errStateChanged: '您编辑期间该预约发生了变化。请刷新后重试。',
    errSessionExpired: '会话已过期。请从 LINE 重新打开此页面。',
    errEditDefault: '未能保存您的更改。请重试。',
    bookingId: '预约编号',
    bookingType: '预约类型',
    regular: '普通',
    package: '套餐',
    coaching: '教练课程',
    notes: '备注',
    bookedOn: '预约日期',
    time: '时间',
    cancellationReasonLabel: '取消原因',
    bookingNotFound: '未找到预约',
    bookingNotFoundDescription: '您查找的预约不存在或已被删除。',
    accessDenied: '访问被拒绝',
    accessDeniedDescription: '您没有权限查看此预约。',

    // Common
    loading: '加载中...',
    error: '错误',
    retry: '重试',
    close: '关闭',
  },
};
