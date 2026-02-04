export interface Promotion {
  id: string;
  image: string;
  title: { en: string; th: string };
  description: { en: string; th: string };
  validUntil?: Date;           // For countdown timer (optional - ongoing promos don't have this)
  ctaType: 'book' | 'contact' | 'link';
  ctaUrl?: string;
  badge?: { en: string; th: string };  // "NEW", "LIMITED TIME", "POPULAR", etc.
  terms?: { en: string; th: string };
}

export const promotions: Promotion[] = [
  // ONGOING: New Customer Promotion
  {
    id: 'new-customer',
    image: '/images/new_customer_promo.jpg',
    title: {
      en: 'Buy 1 Get 1 Free',
      th: 'ซื้อ 1 แถม 1 ฟรี'
    },
    description: {
      en: 'First-time customers get a free hour when you book your first session!',
      th: 'ลูกค้าใหม่รับฟรี 1 ชั่วโมง เมื่อจองครั้งแรก!'
    },
    // No validUntil = ongoing promotion, no countdown
    ctaType: 'book',
    badge: {
      en: 'NEW CUSTOMERS',
      th: 'ลูกค้าใหม่'
    }
  },

  // TIME-LIMITED: Extra Hours Promotion (Feb-Mar)
  {
    id: 'extra-hours-promo',
    image: '/images/promotion_1.jpg',
    title: {
      en: '20% Extra Hours FREE',
      th: 'รับชั่วโมงเพิ่มฟรี 20%'
    },
    description: {
      en: 'Get bonus hours on any Monthly Package!',
      th: 'รับชั่วโมงโบนัสเมื่อซื้อแพ็กเกจรายเดือน!'
    },
    validUntil: new Date('2026-03-31T23:59:59'),  // Shows countdown timer - ends March 31
    ctaType: 'contact',
    badge: {
      en: 'LIMITED TIME',
      th: 'จำกัดเวลา'
    },
    terms: {
      en: 'Valid February to March only.',
      th: 'เฉพาะเดือนกุมภาพันธ์ถึงมีนาคมเท่านั้น'
    }
  },

  // ONGOING: Play & Food Package
  {
    id: 'play-and-food',
    image: '/images/promotion.jpg',
    title: {
      en: 'Play & Food Package',
      th: 'แพ็คเกจ เล่น & ทาน'
    },
    description: {
      en: 'Golf simulator + delicious food for groups. Starting from just ฿240 NET per person!',
      th: 'จำลองกอล์ฟ + อาหารอร่อย สำหรับกลุ่ม เริ่มต้นเพียง ฿240 NET ต่อคน!'
    },
    // No validUntil = ongoing promotion, no countdown
    ctaType: 'link',
    ctaUrl: '/play-and-food',
    badge: {
      en: 'POPULAR',
      th: 'ยอดนิยม'
    }
  },

  // ONGOING: Monthly Packages
  {
    id: 'monthly-packages',
    image: '/images/promotion_2.jpg',
    title: {
      en: 'Monthly Packages',
      th: 'แพ็คเกจรายเดือน'
    },
    description: {
      en: 'Save up to 48% with our monthly packages! From Early Bird to Diamond+, find the perfect package for you.',
      th: 'ประหยัดสูงสุด 48% กับแพ็คเกจรายเดือน! จาก Early Bird ถึง Diamond+ เลือกแพ็คเกจที่เหมาะกับคุณ'
    },
    // No validUntil = ongoing promotion, no countdown
    ctaType: 'book',
    badge: {
      en: 'BEST VALUE',
      th: 'คุ้มที่สุด'
    }
  }
];
