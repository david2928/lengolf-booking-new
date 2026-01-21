/**
 * Coaching Data
 * Static data for the Coaching LIFF page including coach profiles, pricing, and packages
 */

export interface Coach {
  id: string;
  name: string;
  displayName: string;
  fullName: string;
  imageUrl: string;
  color: string;
  specialties: { en: string[]; th: string[] };
  career: string[];
  education?: string;
  certifications: string[];
}

export interface LessonPackage {
  id: string;
  hours: number;
  prices: { golfers1: number; golfers2: number; golfers3to5: number };
  label: { en: string; th: string };
  validity?: { en: string; th: string };
}

export interface SpecialPackage {
  id: string;
  name: { en: string; th: string };
  prices: { golfers1?: number; golfers2?: number };
  description: { en: string; th: string };
  includes: { en: string[]; th: string[] };
  validity: { en: string; th: string };
}

/**
 * Coach profiles with data from Supabase storage (line_curated_images)
 */
export const coaches: Coach[] = [
  {
    id: 'boss',
    name: 'Boss',
    displayName: 'Boss',
    fullName: 'Parin Phokan',
    imageUrl:
      'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/line-messages/curated/b8aaaad8-7a72-4447-9bb7-5676671718cd.jpg',
    color: '#FF6B6B',
    specialties: {
      en: [
        'Drive Training',
        'Course Management',
        'Advanced Shot Shaping',
        'Junior Golf Development',
      ],
      th: ['ฝึกไดรฟ์', 'การวางแผนการเล่น', 'ตีลูกโค้งขั้นสูง', 'โปรแกรมกอล์ฟสำหรับเยาวชน'],
    },
    career: [
      "Lone Star Men's Championship 2022, USA: T44",
      "DBU Men's Classic 2022, USA: T22",
      'Singha-SAT TDT Nakhon Nayok 2022: T59',
    ],
    education:
      'New Mexico Military Institute • Texas A&M International University',
    certifications: ['Thailand PGA Licensed (GI 1416) since Sep 2022'],
  },
  {
    id: 'ratchavin',
    name: 'Ratchavin',
    displayName: 'Ratchavin',
    fullName: 'Ratchavin Tanakasempipat',
    imageUrl:
      'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/line-messages/curated/4ff2e288-9785-410a-8bda-3ae2668f7258.jpg',
    color: '#7B68EE',
    specialties: {
      en: ['Beginner Golf Programs', 'Short Game', 'Junior Golf Development'],
      th: ['โปรแกรมกอล์ฟสำหรับผู้เริ่มต้น', 'การเล่นลูกสั้น', 'โปรแกรมกอล์ฟสำหรับเยาวชน'],
    },
    career: [
      'Turn pro as Thailand PGA Tournament player, 2020',
      'All Thailand Golf Tour Thailand PGA, 2021',
      'Golf Instructor - 9Vision Golf Performance, 2022',
    ],
    certifications: [
      'TrackMan Level 2',
      'Scott Cowx Level 2',
      'Smart2Move BioSwing Level 1',
      'Swing Catalyst Instructor',
      'U.S Kids Golf Coach 1',
    ],
  },
  {
    id: 'min',
    name: 'Min',
    displayName: 'Min',
    fullName: 'Varuth Kjonkittiskul',
    imageUrl:
      'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/line-messages/curated/71c4edfb-95a0-4972-aa05-76a9227702d3.jpg',
    color: '#4ECDC4',
    specialties: {
      en: [
        'Beginner Golf Programs',
        'Course Management',
        'Advanced Shot Shaping',
        'Putting Program',
      ],
      th: [
        'โปรแกรมกอล์ฟสำหรับผู้เริ่มต้น',
        'การวางแผนการเล่น',
        'ตีลูกโค้งขั้นสูง',
        'โปรแกรมพัตกอล์ฟ',
      ],
    },
    career: [
      'Champion VPG Vietnam Heron Lake Match Play 2019 (T-1)',
      'VPG Tour Trang An Championship 2019 (T-2)',
      'VGA Tour Nam a Bank Vietnam Masters 2023 (T-6)',
    ],
    education: 'Bachelor of Sport Science',
    certifications: ['PGA Thailand Licensed since 2019 (TP0944)'],
  },
  {
    id: 'noon',
    name: 'Noon',
    displayName: 'Noon',
    fullName: 'Nucharin Kantapasara',
    imageUrl:
      'https://bisimqmtxjsptehhqpeg.supabase.co/storage/v1/object/public/line-messages/curated/42c8b7d8-01a7-490b-b5da-2ccee9087153.jpg',
    color: '#FF69B4',
    specialties: {
      en: [
        'Beginner Golf Programs',
        'Course Management',
        'Junior Golf Development',
        "Ladies' Golf",
      ],
      th: [
        'โปรแกรมกอล์ฟสำหรับผู้เริ่มต้น',
        'การวางแผนการเล่น',
        'โปรแกรมกอล์ฟสำหรับเยาวชน',
        'โปรแกรมกอล์ฟสำหรับสุภาพสตรี',
      ],
    },
    career: [
      'Golf Instructor at GOLF SPACE ACADEMY',
      'Assistant Golf Coach at CONCORDIAN INTERNATIONAL SCHOOL',
      'Golf Instructor at Robins Junior Golf Program',
      'Assistant Golf Pro at TRUMP NATIONAL DORAL GOLF RESORT & SPA',
    ],
    education:
      'Methodist University (Business Admin, Professional Golf Management) • Chulalongkorn University, Sasin Graduate Institute',
    certifications: [
      'PGA Professional Golf Management Program',
      'SAM Putt Lab',
      'Trackman',
      'S.N.A.G Golf',
      'K-Vest Level 1',
      'Smart2move',
    ],
  },
];

/**
 * Standard lesson packages from the lesson packages image
 */
export const lessonPackages: LessonPackage[] = [
  {
    id: '1hr',
    hours: 1,
    prices: { golfers1: 1800, golfers2: 2400, golfers3to5: 2900 },
    label: { en: '1 Hour', th: '1 ชั่วโมง' },
  },
  {
    id: '5hr',
    hours: 5,
    prices: { golfers1: 8500, golfers2: 11000, golfers3to5: 13650 },
    label: { en: '5 Hour', th: '5 ชั่วโมง' },
    validity: { en: '6 months', th: '6 เดือน' },
  },
  {
    id: '10hr',
    hours: 10,
    prices: { golfers1: 16000, golfers2: 20500, golfers3to5: 25500 },
    label: { en: '10 Hour', th: '10 ชั่วโมง' },
    validity: { en: '12 months', th: '12 เดือน' },
  },
  {
    id: '20hr',
    hours: 20,
    prices: { golfers1: 31000, golfers2: 39000, golfers3to5: 49000 },
    label: { en: '20 Hour', th: '20 ชั่วโมง' },
    validity: { en: '24 months', th: '24 เดือน' },
  },
  {
    id: '30hr',
    hours: 30,
    prices: { golfers1: 45000, golfers2: 57000, golfers3to5: 72000 },
    label: { en: '30 Hour', th: '30 ชั่วโมง' },
    validity: { en: '24 months', th: '24 เดือน' },
  },
  {
    id: '50hr',
    hours: 50,
    prices: { golfers1: 72000, golfers2: 92500, golfers3to5: 117500 },
    label: { en: '50 Hour', th: '50 ชั่วโมง' },
    validity: { en: '24 months', th: '24 เดือน' },
  },
];

/**
 * Special coaching packages with unique benefits
 */
export const specialPackages: SpecialPackage[] = [
  {
    id: 'starter',
    name: { en: 'Starter Package', th: 'โปรแกรมเริ่มต้น' },
    prices: { golfers1: 11000, golfers2: 13500 },
    description: {
      en: '5 Hours Coaching + 5 Hours Practice',
      th: '5 ชั่วโมงโค้ชชิ่ง + 5 ชั่วโมงฝึกซ้อม',
    },
    includes: {
      en: ['5 hours of coaching', '5 hours of practice', 'Free golf glove'],
      th: ['โค้ชชิ่ง 5 ชั่วโมง', 'ฝึกซ้อม 5 ชั่วโมง', 'ฟรี! ถุงมือกอล์ฟ'],
    },
    validity: { en: '6 months', th: '6 เดือน' },
  },
  {
    id: 'sim-to-fairway',
    name: { en: 'Sim to Fairway', th: 'ซิมสู่แฟร์เวย์' },
    prices: { golfers1: 13499 },
    description: {
      en: '5 Hours Coaching + 1 On-course Lesson',
      th: '5 ชั่วโมงโค้ชชิ่ง + 1 บทเรียนในสนาม',
    },
    includes: {
      en: [
        '5 hours of simulator coaching',
        '1 on-course lesson',
        'On-course fees covered by customer',
      ],
      th: [
        'โค้ชชิ่งในซิม 5 ชั่วโมง',
        'บทเรียนในสนาม 1 ครั้ง',
        'ค่าใช้จ่ายในสนามลูกค้าออกเอง',
      ],
    },
    validity: { en: '6 months', th: '6 เดือน' },
  },
];

/**
 * Package includes (what's provided with lessons)
 */
export const packageIncludes = {
  en: [
    'Golf clubs provided',
    'Coaching equipment provided',
    'Simulator usage included',
    'For 3-5 players, 2 bays included',
  ],
  th: [
    'ให้บริการไม้กอล์ฟ',
    'อุปกรณ์ในการฝึกสอน',
    'ให้บริการซิมมูเลเตอร์',
    'สำหรับ 3-5 คน ให้บริการ 2 เบย์',
  ],
};

/**
 * Get coach by ID
 */
export function getCoachById(id: string): Coach | undefined {
  return coaches.find((coach) => coach.id === id);
}

/**
 * Get coach by display name
 */
export function getCoachByDisplayName(displayName: string): Coach | undefined {
  return coaches.find((coach) => coach.displayName === displayName);
}
